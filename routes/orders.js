const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../middleware/auth');
const { notify } = require('../lib/helpers');
const { sendOrderEmail } = require('../lib/mailer');
const payments = require('../lib/payments');
const { streamReceipt } = require('../lib/receipt');
const fx = require('../lib/currency');

const router = express.Router();

function validShipping(s) {
  if (!s) return false;
  return ['name', 'line1', 'city', 'zip'].every((k) => String(s[k] || '').trim());
}

// Currency fields locked onto an order at creation/checkout time.
function lockedCurrency(req, amountUsd) {
  const { selected } = fx.detectCurrency(req);
  return { currency: selected, fxRate: fx.rateFor(selected), amountInCurrency: fx.convert(amountUsd, selected) };
}

// Orders created before multi-currency (or via offer acceptance) may have no
// currency yet — lock the buyer's currency the first time they hit checkout.
function ensureCurrency(order, req) {
  if (order.currency || !req.user || req.user.id !== order.buyerId || order.status !== 'pending_payment') return order;
  return db.orders.update(order.id, lockedCurrency(req, order.amount));
}

function decorateOrder(o, viewerId) {
  const product = db.products.byId(o.productId);
  const buyer = db.users.byId(o.buyerId);
  const seller = db.users.byId(o.sellerId);
  const currency = o.currency || 'USD';
  const amountInCurrency = o.amountInCurrency != null ? o.amountInCurrency : o.amount;
  return {
    ...o,
    currency,
    amountInCurrency,
    charged: fx.format(amountInCurrency, currency), // e.g. "₹4,275.00"
    role: o.buyerId === viewerId ? 'buyer' : 'seller',
    product: product ? { id: product.id, title: product.title, image: product.image, thumb: product.thumb, category: product.category } : null,
    buyerName: buyer?.name || 'User',
    sellerName: seller?.name || 'User',
    reviewed: !!db.reviews.findOne((r) => r.productId === o.productId && r.buyerId === o.buyerId),
  };
}

// All orders of a checkout group that belong to this buyer.
function ordersInGroup(groupId, buyerId) {
  return db.orders.find((o) => o.groupId === groupId && o.buyerId === buyerId);
}

function groupTotals(orders) {
  const currency = orders[0]?.currency || 'USD';
  const totalUsd = Math.round(orders.reduce((s, o) => s + o.amount, 0) * 100) / 100;
  const total = orders.reduce((s, o) => s + (o.amountInCurrency != null ? o.amountInCurrency : o.amount), 0);
  const rounded = fx.CURRENCIES[currency]?.zeroDecimal ? Math.round(total) : Math.round(total * 100) / 100;
  return { currency, totalUsd, total: rounded, totalFormatted: fx.format(rounded, currency) };
}

function notifyAdmins(text, link) {
  db.users.find((u) => u.role === 'admin').forEach((a) => notify(a.id, 'dispute', text, link));
}

module.exports = function ordersRouter(io) {
  // POST /api/orders — start a checkout (Buy Now). Reserves the item.
  router.post('/', requireAuth, requireVerified, (req, res) => {
    const { productId } = req.body || {};
    const product = db.products.byId(productId);
    if (!product || product.status !== 'available') {
      return res.status(400).json({ error: 'This item is not available' });
    }
    if (product.sellerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot buy your own item' });
    }
    const order = db.orders.insert({
      productId,
      buyerId: req.user.id,
      sellerId: product.sellerId,
      amount: product.price,
      ...lockedCurrency(req, product.price),
      status: 'pending_payment',
      shipping: null,
      payment: null,
      refundStatus: 'none',
    });
    db.products.update(product.id, { status: 'reserved', reservedBy: req.user.id });
    res.json({ order: decorateOrder(order, req.user.id) });
  });

  // GET /api/orders/mine — buyer purchases + seller sales.
  router.get('/mine', requireAuth, (req, res) => {
    const purchases = db.orders
      .find((o) => o.buyerId === req.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => decorateOrder(o, req.user.id));
    const sales = db.orders
      .find((o) => o.sellerId === req.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => decorateOrder(o, req.user.id));
    res.json({ purchases, sales });
  });

  // Mark a single order paid + sold and fire all side effects.
  // Shared by the single-order and cart-group payment paths.
  function fulfillPaidOrder(order, cleanShipping, payment) {
    const product = db.products.byId(order.productId);
    db.orders.update(order.id, { status: 'paid', shipping: cleanShipping, payment });
    db.products.update(product.id, { status: 'sold', buyerId: order.buyerId, soldPrice: order.amount, soldAt: new Date().toISOString() });
    db.offers.find((o) => o.productId === product.id && o.status === 'pending').forEach((o) => db.offers.update(o.id, { status: 'rejected' }));

    notify(order.sellerId, 'sale', `💰 You sold "${product.title}" for $${order.amount} — ship it to the buyer`, '/dashboard.html');
    notify(order.buyerId, 'order', `Payment confirmed for "${product.title}". We'll notify you when it ships.`, '/dashboard.html');
    const buyer = db.users.byId(order.buyerId);
    if (buyer) sendOrderEmail(buyer, db.orders.byId(order.id), product).catch(() => {});
    io.to(`user:${order.sellerId}`).emit('order:update', { orderId: order.id });
  }

  /* ------------------------- cart checkout groups ------------------------- */
  // GET /api/orders/group/:groupId — all orders in a cart checkout (buyer only).
  router.get('/group/:groupId', requireAuth, (req, res) => {
    const orders = ordersInGroup(req.params.groupId, req.user.id);
    if (!orders.length) return res.status(404).json({ error: 'Checkout not found' });
    res.json({
      orders: orders.map((o) => decorateOrder(o, req.user.id)),
      ...groupTotals(orders),
    });
  });

  // POST /api/orders/group/:groupId/payment-intent — one PaymentIntent for the
  // whole cart, charged in the currency locked at checkout creation.
  router.post('/group/:groupId/payment-intent', requireAuth, requireVerified, async (req, res) => {
    if (!payments.enabled) return res.status(400).json({ error: 'Stripe is not configured' });
    const orders = ordersInGroup(req.params.groupId, req.user.id).filter((o) => o.status === 'pending_payment');
    if (!orders.length) return res.status(400).json({ error: 'No orders awaiting payment in this checkout' });
    const { total, currency } = groupTotals(orders);
    try {
      const pi = await payments.createPaymentIntent(total, { groupId: req.params.groupId }, currency);
      orders.forEach((o) => db.orders.update(o.id, { paymentIntentId: pi.id }));
      res.json({ clientSecret: pi.clientSecret });
    } catch (e) {
      res.status(502).json({ error: 'Could not start payment: ' + e.message });
    }
  });

  // POST /api/orders/group/:groupId/pay — finalize every order in the cart
  // with a single payment (Stripe-confirmed or stub card).
  router.post('/group/:groupId/pay', requireAuth, requireVerified, async (req, res) => {
    const orders = ordersInGroup(req.params.groupId, req.user.id).filter((o) => o.status === 'pending_payment');
    if (!orders.length) return res.status(400).json({ error: 'No orders awaiting payment in this checkout' });

    const { shipping, card, paymentIntentId, saveAddress } = req.body || {};
    if (!validShipping(shipping)) return res.status(400).json({ error: 'Complete your shipping address' });
    const { total, currency } = groupTotals(orders);

    let payment;
    if (payments.enabled) {
      const pid = paymentIntentId || orders[0].paymentIntentId;
      if (!pid) return res.status(400).json({ error: 'Missing payment confirmation' });
      const v = await payments.confirmPaymentIntent(pid, total, currency);
      if (!v.ok) return res.status(400).json({ error: v.error });
      payment = { brand: v.brand, last4: v.last4, paidAt: new Date().toISOString(), provider: 'stripe', paymentIntentId: pid };
    } else {
      const v = payments.validateStubCard(card);
      if (!v.ok) return res.status(400).json({ error: v.error });
      payment = { brand: v.brand, last4: v.last4, paidAt: new Date().toISOString(), provider: 'stub' };
    }

    const cleanShipping = { name: shipping.name, line1: shipping.line1, city: shipping.city, zip: shipping.zip, country: shipping.country || '' };
    orders.forEach((o) => fulfillPaidOrder(o, cleanShipping, payment));

    if (saveAddress) {
      const list = req.user.addresses || [];
      list.push({ id: db.genId(), ...cleanShipping, isDefault: list.length === 0 });
      db.users.update(req.user.id, { addresses: list });
    }

    const fresh = ordersInGroup(req.params.groupId, req.user.id);
    res.json({ orders: fresh.map((o) => decorateOrder(o, req.user.id)), ...groupTotals(fresh) });
  });

  // POST /api/orders/group/:groupId/cancel — abandon an unpaid cart checkout.
  router.post('/group/:groupId/cancel', requireAuth, (req, res) => {
    const orders = ordersInGroup(req.params.groupId, req.user.id).filter((o) => o.status === 'pending_payment');
    if (!orders.length) return res.status(400).json({ error: 'Nothing to cancel' });
    orders.forEach((o) => {
      db.orders.update(o.id, { status: 'cancelled' });
      const product = db.products.byId(o.productId);
      if (product && product.status === 'reserved') db.products.update(product.id, { status: 'available', reservedBy: null });
    });
    res.json({ ok: true });
  });

  // GET /api/orders/:id — order detail (participants only).
  router.get('/:id', requireAuth, (req, res) => {
    let order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (![order.buyerId, order.sellerId].includes(req.user.id)) {
      return res.status(403).json({ error: 'Not your order' });
    }
    order = ensureCurrency(order, req);
    res.json({ order: decorateOrder(order, req.user.id) });
  });

  // POST /api/orders/:id/payment-intent — create a Stripe PaymentIntent (Stripe mode only).
  router.post('/:id/payment-intent', requireAuth, requireVerified, async (req, res) => {
    if (!payments.enabled) return res.status(400).json({ error: 'Stripe is not configured' });
    let order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.buyerId !== req.user.id) return res.status(403).json({ error: 'Not your order' });
    if (order.status !== 'pending_payment') return res.status(400).json({ error: 'Order is not awaiting payment' });
    order = ensureCurrency(order, req);
    try {
      const pi = await payments.createPaymentIntent(
        order.amountInCurrency != null ? order.amountInCurrency : order.amount,
        { orderId: order.id },
        order.currency || 'USD'
      );
      db.orders.update(order.id, { paymentIntentId: pi.id });
      res.json({ clientSecret: pi.clientSecret });
    } catch (e) {
      res.status(502).json({ error: 'Could not start payment: ' + e.message });
    }
  });

  // POST /api/orders/:id/pay — finalize payment (Stripe-confirmed or stub card).
  router.post('/:id/pay', requireAuth, requireVerified, async (req, res) => {
    let order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.buyerId !== req.user.id) return res.status(403).json({ error: 'Not your order' });
    if (order.status !== 'pending_payment') return res.status(400).json({ error: 'This order is no longer awaiting payment' });
    order = ensureCurrency(order, req);

    const { shipping, card, paymentIntentId, saveAddress } = req.body || {};
    if (!validShipping(shipping)) return res.status(400).json({ error: 'Complete your shipping address' });

    let payment;
    if (payments.enabled) {
      // Stripe mode: the client already confirmed the PaymentIntent.
      const pid = paymentIntentId || order.paymentIntentId;
      if (!pid) return res.status(400).json({ error: 'Missing payment confirmation' });
      const v = await payments.confirmPaymentIntent(
        pid,
        order.amountInCurrency != null ? order.amountInCurrency : order.amount,
        order.currency || 'USD'
      );
      if (!v.ok) return res.status(400).json({ error: v.error });
      payment = { brand: v.brand, last4: v.last4, paidAt: new Date().toISOString(), provider: 'stripe', paymentIntentId: pid };
    } else {
      // Stub mode: validate the fake card.
      const v = payments.validateStubCard(card);
      if (!v.ok) return res.status(400).json({ error: v.error });
      payment = { brand: v.brand, last4: v.last4, paidAt: new Date().toISOString(), provider: 'stub' };
    }

    const cleanShipping = { name: shipping.name, line1: shipping.line1, city: shipping.city, zip: shipping.zip, country: shipping.country || '' };
    fulfillPaidOrder(order, cleanShipping, payment);

    // Optionally remember this shipping address for next time.
    if (saveAddress) {
      const list = req.user.addresses || [];
      list.push({ id: db.genId(), ...cleanShipping, isDefault: list.length === 0 });
      db.users.update(req.user.id, { addresses: list });
    }

    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  // GET /api/orders/:id/receipt — downloadable PDF receipt.
  router.get('/:id/receipt', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (![order.buyerId, order.sellerId].includes(req.user.id)) return res.status(403).json({ error: 'Not your order' });
    if (!['paid', 'shipped', 'delivered', 'refunded'].includes(order.status)) {
      return res.status(400).json({ error: 'Receipt available after payment' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="receipt-${order.id}.pdf"`);
    streamReceipt(res, {
      order,
      product: db.products.byId(order.productId),
      buyer: db.users.byId(order.buyerId),
      seller: db.users.byId(order.sellerId),
    });
  });

  // POST /api/orders/:id/ship — seller marks shipped (optional tracking number).
  router.post('/:id/ship', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.sellerId !== req.user.id) return res.status(403).json({ error: 'Only the seller can do this' });
    if (order.status !== 'paid') return res.status(400).json({ error: 'Order is not ready to ship' });
    db.orders.update(order.id, { status: 'shipped', tracking: String(req.body?.tracking || '').slice(0, 60), shippedAt: new Date().toISOString() });
    const product = db.products.byId(order.productId);
    notify(order.buyerId, 'order', `📦 "${product?.title}" has shipped!`, '/dashboard.html');
    io.to(`user:${order.buyerId}`).emit('order:update', { orderId: order.id });
    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  // POST /api/orders/:id/deliver — buyer confirms receipt.
  router.post('/:id/deliver', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.buyerId !== req.user.id) return res.status(403).json({ error: 'Only the buyer can confirm delivery' });
    if (!['shipped', 'paid'].includes(order.status)) return res.status(400).json({ error: 'Order cannot be marked delivered' });
    db.orders.update(order.id, { status: 'delivered', deliveredAt: new Date().toISOString() });
    const product = db.products.byId(order.productId);
    notify(order.sellerId, 'order', `✅ Buyer confirmed delivery of "${product?.title}"`, '/dashboard.html');
    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  // POST /api/orders/:id/cancel — cancel an unpaid order, releasing the item.
  router.post('/:id/cancel', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (![order.buyerId, order.sellerId].includes(req.user.id)) return res.status(403).json({ error: 'Not your order' });
    if (order.status !== 'pending_payment') return res.status(400).json({ error: 'Only unpaid orders can be cancelled' });
    db.orders.update(order.id, { status: 'cancelled' });
    const product = db.products.byId(order.productId);
    if (product && product.status === 'reserved') db.products.update(product.id, { status: 'available', reservedBy: null });
    const other = req.user.id === order.buyerId ? order.sellerId : order.buyerId;
    notify(other, 'order', `An order for "${product?.title}" was cancelled`, '/dashboard.html');
    res.json({ ok: true });
  });

  /* ------------------------------ refunds / disputes ------------------------------ */
  // POST /api/orders/:id/refund-request — buyer opens a dispute / asks for a refund.
  router.post('/:id/refund-request', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.buyerId !== req.user.id) return res.status(403).json({ error: 'Only the buyer can request a refund' });
    if (!['paid', 'shipped', 'delivered'].includes(order.status)) return res.status(400).json({ error: 'This order is not eligible for a refund' });
    if (['requested', 'refunded'].includes(order.refundStatus)) return res.status(400).json({ error: 'A refund is already in progress' });
    const reason = String(req.body?.reason || '').slice(0, 400) || 'No reason given';
    db.orders.update(order.id, { refundStatus: 'requested', refundReason: reason, refundRequestedAt: new Date().toISOString() });
    const product = db.products.byId(order.productId);
    notify(order.sellerId, 'dispute', `⚠️ Refund requested for "${product?.title}": ${reason}`, '/dashboard.html');
    notifyAdmins(`Refund/dispute opened on "${product?.title}" ($${order.amount})`, '/admin.html');
    io.to(`user:${order.sellerId}`).emit('order:update', { orderId: order.id });
    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  // POST /api/orders/:id/refund-approve — seller or admin approves the refund.
  router.post('/:id/refund-approve', requireAuth, async (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isAdmin = req.user.role === 'admin';
    if (order.sellerId !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Not allowed' });
    if (order.refundStatus !== 'requested') return res.status(400).json({ error: 'No refund pending on this order' });

    const r = await payments.refund(order.payment?.paymentIntentId);
    if (!r.ok) return res.status(502).json({ error: 'Refund failed: ' + (r.error || 'unknown') });

    db.orders.update(order.id, { status: 'refunded', refundStatus: 'refunded', refundedAt: new Date().toISOString() });
    const product = db.products.byId(order.productId);
    if (product) db.products.update(product.id, { status: 'refunded' });
    notify(order.buyerId, 'order', `✅ Your refund of $${order.amount} for "${product?.title}" was approved`, '/dashboard.html');
    io.to(`user:${order.buyerId}`).emit('order:update', { orderId: order.id });
    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  // POST /api/orders/:id/refund-reject — seller or admin declines the refund.
  router.post('/:id/refund-reject', requireAuth, (req, res) => {
    const order = db.orders.byId(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const isAdmin = req.user.role === 'admin';
    if (order.sellerId !== req.user.id && !isAdmin) return res.status(403).json({ error: 'Not allowed' });
    if (order.refundStatus !== 'requested') return res.status(400).json({ error: 'No refund pending on this order' });
    db.orders.update(order.id, { refundStatus: 'rejected' });
    const product = db.products.byId(order.productId);
    notify(order.buyerId, 'order', `Your refund request for "${product?.title}" was declined`, '/dashboard.html');
    io.to(`user:${order.buyerId}`).emit('order:update', { orderId: order.id });
    res.json({ order: decorateOrder(db.orders.byId(order.id), req.user.id) });
  });

  return router;
};

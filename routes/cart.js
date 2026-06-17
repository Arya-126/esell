const express = require('express');
const db = require('../db');
const { requireAuth, requireVerified } = require('../middleware/auth');
const fx = require('../lib/currency');

const router = express.Router();

// One cart row per (userId, productId). Quantity is always 1 — every listing
// on a resell marketplace is a unique item.
function cartItems(userId) {
  const rows = db.carts.find((c) => c.userId === userId);
  const items = [];
  for (const row of rows) {
    const p = db.products.byId(row.productId);
    // Auto-prune entries whose listing was sold/reserved/removed meanwhile.
    if (!p || p.status !== 'available') { db.carts.remove(row.id); continue; }
    items.push({
      id: row.id,
      addedAt: row.createdAt,
      product: {
        id: p.id, title: p.title, price: p.price, image: p.image, thumb: p.thumb,
        category: p.category, condition: p.condition, sellerId: p.sellerId,
        sellerName: db.users.byId(p.sellerId)?.name || 'User',
      },
    });
  }
  return items;
}

function summary(req, items) {
  const { selected } = fx.detectCurrency(req);
  const totalUsd = Math.round(items.reduce((s, i) => s + i.product.price, 0) * 100) / 100;
  return {
    items,
    count: items.length,
    totalUsd,
    currency: selected,
    fxRate: fx.rateFor(selected),
    total: fx.convert(totalUsd, selected),
    totalFormatted: fx.format(fx.convert(totalUsd, selected), selected),
  };
}

// GET /api/cart — current cart with totals in the viewer's currency.
router.get('/', requireAuth, (req, res) => {
  res.json(summary(req, cartItems(req.user.id)));
});

// POST /api/cart — add a product.
router.post('/', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  const p = db.products.byId(productId);
  if (!p || p.status !== 'available') return res.status(400).json({ error: 'This item is not available' });
  if (p.sellerId === req.user.id) return res.status(400).json({ error: 'You cannot buy your own item' });
  if (!db.carts.findOne((c) => c.userId === req.user.id && c.productId === productId)) {
    db.carts.insert({ userId: req.user.id, productId });
  }
  res.json(summary(req, cartItems(req.user.id)));
});

// DELETE /api/cart/:productId — remove one item.
router.delete('/:productId', requireAuth, (req, res) => {
  const row = db.carts.findOne((c) => c.userId === req.user.id && c.productId === req.params.productId);
  if (row) db.carts.remove(row.id);
  res.json(summary(req, cartItems(req.user.id)));
});

// POST /api/cart/checkout — turn the cart into a group of pending orders
// (one per item, sharing a groupId paid with a single payment), reserving
// every listing. The fx rate is locked on each order here.
router.post('/checkout', requireAuth, requireVerified, (req, res) => {
  const items = cartItems(req.user.id);
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty' });

  const { selected } = fx.detectCurrency(req);
  const groupId = db.genId();
  const orders = items.map(({ product }) => {
    const order = db.orders.insert({
      productId: product.id,
      buyerId: req.user.id,
      sellerId: product.sellerId,
      amount: product.price, // USD (base)
      currency: selected,
      fxRate: fx.rateFor(selected),
      amountInCurrency: fx.convert(product.price, selected),
      groupId,
      status: 'pending_payment',
      shipping: null,
      payment: null,
      refundStatus: 'none',
    });
    db.products.update(product.id, { status: 'reserved', reservedBy: req.user.id });
    return order;
  });

  // Items now live as reserved orders; empty the cart.
  db.carts.find((c) => c.userId === req.user.id).forEach((c) => db.carts.remove(c.id));

  res.json({ groupId, orders });
});

module.exports = router;

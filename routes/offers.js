const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const { notify } = require('../lib/helpers');

const router = express.Router();

/**
 * Built-in negotiation: buyers make offers, sellers accept / reject / counter.
 * An accepted offer marks the product sold to that buyer at the agreed price.
 * The io instance is injected from server.js so we can push live updates.
 */
module.exports = function offersRouter(io) {
  // POST /api/offers — buyer makes an offer (or a seller counters via amount).
  router.post('/', requireAuth, (req, res) => {
    const { productId, amount } = req.body || {};
    const product = db.products.byId(productId);
    if (!product || product.status !== 'available') {
      return res.status(400).json({ error: 'Item is not available' });
    }
    if (product.sellerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot make an offer on your own item' });
    }
    const amt = Number(amount);
    if (!(amt > 0)) return res.status(400).json({ error: 'Enter a valid amount' });

    // Supersede the buyer's previous pending offer on this item.
    db.offers
      .find((o) => o.productId === productId && o.buyerId === req.user.id && o.status === 'pending')
      .forEach((o) => db.offers.update(o.id, { status: 'superseded' }));

    const offer = db.offers.insert({
      productId,
      buyerId: req.user.id,
      sellerId: product.sellerId,
      amount: amt,
      status: 'pending',
      from: 'buyer',
    });
    notify(product.sellerId, 'offer', `New offer of $${amt} on "${product.title}"`, `/chat.html`);
    io.to(`user:${product.sellerId}`).emit('offer:new', { offer, product: { id: product.id, title: product.title } });
    res.json({ offer });
  });

  // POST /api/offers/:id/respond — seller accepts / rejects / counters.
  router.post('/:id/respond', requireAuth, (req, res) => {
    const offer = db.offers.byId(req.params.id);
    if (!offer) return res.status(404).json({ error: 'Offer not found' });
    const product = db.products.byId(offer.productId);
    const { action, counter } = req.body || {};

    const isSeller = offer.sellerId === req.user.id;
    const isBuyer = offer.buyerId === req.user.id;
    if (!isSeller && !isBuyer) return res.status(403).json({ error: 'Not your offer' });

    if (action === 'accept') {
      if (offer.status !== 'pending') return res.status(400).json({ error: 'Offer not pending' });
      if (!product || product.status !== 'available') return res.status(400).json({ error: 'Item is no longer available' });
      // Only the receiving party can accept.
      if (offer.from === 'buyer' && !isSeller) return res.status(403).json({ error: 'Only the seller can accept' });
      if (offer.from === 'seller' && !isBuyer) return res.status(403).json({ error: 'Only the buyer can accept' });
      db.offers.update(offer.id, { status: 'accepted' });
      // Reserve the item and open a checkout order at the agreed price.
      db.products.update(product.id, { status: 'reserved', reservedBy: offer.buyerId });
      const order = db.orders.insert({
        productId: product.id,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        amount: offer.amount,
        status: 'pending_payment',
        shipping: null,
        payment: null,
        offerId: offer.id,
      });
      notify(offer.buyerId, 'offer', `Your $${offer.amount} offer on "${product.title}" was accepted! 🎉 Complete checkout to confirm.`, `/checkout.html?order=${order.id}`);
      notify(offer.sellerId, 'offer', `You accepted a $${offer.amount} offer on "${product.title}" — awaiting buyer payment`, `/dashboard.html`);
      io.to(`user:${offer.buyerId}`).emit('offer:update', { offer: db.offers.byId(offer.id), orderId: order.id });
      io.to(`user:${offer.sellerId}`).emit('offer:update', { offer: db.offers.byId(offer.id) });
      return res.json({ offer: db.offers.byId(offer.id), orderId: order.id });
    }

    if (action === 'reject') {
      db.offers.update(offer.id, { status: 'rejected' });
      const target = isSeller ? offer.buyerId : offer.sellerId;
      notify(target, 'offer', `An offer on "${product.title}" was declined`, `/chat.html`);
      io.to(`user:${target}`).emit('offer:update', { offer: db.offers.byId(offer.id) });
      return res.json({ offer: db.offers.byId(offer.id) });
    }

    if (action === 'counter') {
      const amt = Number(counter);
      if (!(amt > 0)) return res.status(400).json({ error: 'Enter a valid counter amount' });
      db.offers.update(offer.id, { status: 'countered' });
      const newOffer = db.offers.insert({
        productId: offer.productId,
        buyerId: offer.buyerId,
        sellerId: offer.sellerId,
        amount: amt,
        status: 'pending',
        from: isSeller ? 'seller' : 'buyer',
      });
      const target = isSeller ? offer.buyerId : offer.sellerId;
      notify(target, 'offer', `Counter-offer: $${amt} on "${product.title}"`, `/chat.html`);
      io.to(`user:${target}`).emit('offer:new', { offer: newOffer, product: { id: product.id, title: product.title } });
      return res.json({ offer: newOffer });
    }

    res.status(400).json({ error: 'Unknown action' });
  });

  return router;
};

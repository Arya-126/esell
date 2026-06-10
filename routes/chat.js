const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Find or create the conversation between the current user (buyer) and a product's seller.
function getOrCreateConversation(productId, buyerId) {
  const product = db.products.byId(productId);
  if (!product) return { error: 'Product not found' };
  if (product.sellerId === buyerId) return { error: 'You cannot message yourself about your own item' };
  let convo = db.conversations.findOne(
    (c) => c.productId === productId && c.buyerId === buyerId
  );
  if (!convo) {
    convo = db.conversations.insert({ productId, buyerId, sellerId: product.sellerId });
  }
  return { convo };
}

function decorateConversation(c, userId) {
  const product = db.products.byId(c.productId);
  const other = db.users.byId(c.buyerId === userId ? c.sellerId : c.buyerId);
  const msgs = db.messages.find((m) => m.conversationId === c.id);
  const last = msgs[msgs.length - 1];
  const unread = msgs.filter((m) => m.senderId !== userId && !m.read).length;
  return {
    id: c.id,
    productId: c.productId,
    productTitle: product?.title || '(deleted)',
    productImage: product?.image || null,
    other: other ? { id: other.id, name: other.name } : { id: null, name: 'User' },
    role: c.buyerId === userId ? 'buyer' : 'seller',
    lastMessage: last ? last.text : null,
    lastAt: last ? last.createdAt : c.createdAt,
    unread,
  };
}

// GET /api/chat — all my conversations (inbox).
router.get('/', requireAuth, (req, res) => {
  const convos = db.conversations
    .find((c) => c.buyerId === req.user.id || c.sellerId === req.user.id)
    .map((c) => decorateConversation(c, req.user.id))
    .sort((a, b) => (b.lastAt || '').localeCompare(a.lastAt || ''));
  res.json({ conversations: convos });
});

// POST /api/chat/start — start (or resume) a chat about a product.
router.post('/start', requireAuth, (req, res) => {
  const { productId } = req.body || {};
  const { convo, error } = getOrCreateConversation(productId, req.user.id);
  if (error) return res.status(400).json({ error });
  res.json({ conversationId: convo.id });
});

// GET /api/chat/:id — message history for one conversation, with offers inline.
router.get('/:id', requireAuth, (req, res) => {
  const convo = db.conversations.byId(req.params.id);
  if (!convo) return res.status(404).json({ error: 'Conversation not found' });
  if (![convo.buyerId, convo.sellerId].includes(req.user.id)) {
    return res.status(403).json({ error: 'Not your conversation' });
  }
  // Mark incoming messages read.
  db.messages
    .find((m) => m.conversationId === convo.id && m.senderId !== req.user.id && !m.read)
    .forEach((m) => db.messages.update(m.id, { read: true }));

  const messages = db.messages
    .find((m) => m.conversationId === convo.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const product = db.products.byId(convo.productId);
  const offers = db.offers
    .find((o) => o.productId === convo.productId &&
      ((o.buyerId === convo.buyerId && o.sellerId === convo.sellerId)))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  res.json({
    conversation: decorateConversation(convo, req.user.id),
    product: product ? { id: product.id, title: product.title, price: product.price, image: product.image, status: product.status, sellerId: product.sellerId } : null,
    messages,
    offers,
    me: req.user.id,
  });
});

module.exports = { router, getOrCreateConversation };

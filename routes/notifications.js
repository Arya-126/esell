const express = require('express');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const items = db.notifications
    .find((n) => n.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);
  res.json({ notifications: items, unread: items.filter((n) => !n.read).length });
});

router.post('/read', requireAuth, (req, res) => {
  db.notifications
    .find((n) => n.userId === req.user.id && !n.read)
    .forEach((n) => db.notifications.update(n.id, { read: true }));
  res.json({ ok: true });
});

module.exports = router;

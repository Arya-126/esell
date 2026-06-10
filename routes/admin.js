const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { publicUser, ecoSavedFor } = require('../lib/helpers');

const router = express.Router();

router.use(requireAdmin);

// GET /api/admin/stats — headline metrics for the dashboard.
router.get('/stats', (_req, res) => {
  const products = db.products.all();
  const sold = products.filter((p) => p.status === 'sold');
  const gmv = sold.reduce((s, p) => s + (p.soldPrice || p.price), 0);
  const totalEco = sold.reduce((s, p) => s + ecoSavedFor(p.category), 0);

  // Category breakdown for a simple bar chart.
  const byCategory = {};
  products.filter((p) => p.status !== 'removed').forEach((p) => {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  });

  res.json({
    users: db.users.count(),
    bannedUsers: db.users.count((u) => u.banned),
    products: db.products.count((p) => p.status === 'available'),
    sold: sold.length,
    messages: db.messages.count(),
    offers: db.offers.count(),
    orders: db.orders.count((o) => ['paid', 'shipped', 'delivered'].includes(o.status)),
    pendingShipments: db.orders.count((o) => o.status === 'paid'),
    openDisputes: db.orders.count((o) => o.refundStatus === 'requested'),
    refunded: db.orders.count((o) => o.status === 'refunded'),
    openReports: db.reports.count((r) => !r.resolved),
    gmv,
    totalEco,
    byCategory,
  });
});

// GET /api/admin/users
router.get('/users', (_req, res) => {
  const users = db.users
    .all()
    .map((u) => ({
      ...publicUser(u),
      listings: db.products.count((p) => p.sellerId === u.id && p.status !== 'removed'),
      sales: db.products.count((p) => p.sellerId === u.id && p.status === 'sold'),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ users });
});

// POST /api/admin/users/:id/ban  { banned: true|false }
router.post('/users/:id/ban', (req, res) => {
  const user = db.users.byId(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(400).json({ error: 'Cannot ban an admin' });
  db.users.update(user.id, { banned: !!req.body.banned });
  res.json({ user: publicUser(db.users.byId(user.id)) });
});

// GET /api/admin/products — every listing including removed.
router.get('/products', (_req, res) => {
  const products = db.products
    .all()
    .map((p) => ({
      ...p,
      sellerName: db.users.byId(p.sellerId)?.name || 'Unknown',
      reports: db.reports.count((r) => r.productId === p.id && !r.resolved),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ products });
});

// DELETE /api/admin/products/:id — hard takedown.
router.delete('/products/:id', (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  db.products.update(p.id, { status: 'removed' });
  res.json({ ok: true });
});

// GET /api/admin/reports — open reports queue.
router.get('/reports', (_req, res) => {
  const reports = db.reports
    .find((r) => !r.resolved)
    .map((r) => ({
      ...r,
      product: db.products.byId(r.productId),
      reporter: db.users.byId(r.reporterId)?.name || 'Unknown',
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ reports });
});

// POST /api/admin/reports/:id/resolve
router.post('/reports/:id/resolve', (req, res) => {
  const r = db.reports.byId(req.params.id);
  if (!r) return res.status(404).json({ error: 'Not found' });
  db.reports.update(r.id, { resolved: true });
  res.json({ ok: true });
});

// GET /api/admin/disputes — open refund/dispute queue.
router.get('/disputes', (_req, res) => {
  const disputes = db.orders
    .find((o) => o.refundStatus === 'requested')
    .map((o) => ({
      ...o,
      product: db.products.byId(o.productId),
      buyerName: db.users.byId(o.buyerId)?.name || 'Buyer',
      sellerName: db.users.byId(o.sellerId)?.name || 'Seller',
    }))
    .sort((a, b) => (b.refundRequestedAt || '').localeCompare(a.refundRequestedAt || ''));
  res.json({ disputes });
});

module.exports = router;

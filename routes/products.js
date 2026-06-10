const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('../db');
const { requireAuth, optionalAuth, requireVerified } = require('../middleware/auth');
const { ecoSavedFor, fairPrice, trustScoreFor, publicUser, notify } = require('../lib/helpers');
const { makeThumbnail } = require('../lib/images');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 6) || '.jpg';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

const CATEGORIES = ['Electronics', 'Clothing', 'Furniture', 'Books', 'Toys', 'Sports', 'Home', 'Other'];
const CONDITIONS = ['New', 'Like New', 'Good', 'Fair', 'For Parts'];

// Enrich a product record with computed fields for the client.
function decorate(p, viewer) {
  const seller = db.users.byId(p.sellerId);
  return {
    ...p,
    seller: seller ? { id: seller.id, name: seller.name, trustScore: trustScoreFor(seller.id) } : null,
    ecoSaved: ecoSavedFor(p.category),
    fair: fairPrice(p.category, p.price),
    watchCount: db.watchlist.count((w) => w.productId === p.id),
    isWatched: viewer ? !!db.watchlist.findOne((w) => w.productId === p.id && w.userId === viewer.id) : false,
  };
}

// GET /api/products  — browse with search/filter/sort.
router.get('/', optionalAuth, (req, res) => {
  const { q, category, condition, max, sort } = req.query;
  let items = db.products.find((p) => p.status === 'available');
  if (q) {
    const needle = q.toLowerCase();
    items = items.filter(
      (p) => p.title.toLowerCase().includes(needle) || p.description.toLowerCase().includes(needle)
    );
  }
  if (category && category !== 'All') items = items.filter((p) => p.category === category);
  if (condition) items = items.filter((p) => p.condition === condition);
  if (max) items = items.filter((p) => p.price <= Number(max));

  switch (sort) {
    case 'price-asc': items.sort((a, b) => a.price - b.price); break;
    case 'price-desc': items.sort((a, b) => b.price - a.price); break;
    case 'eco': items.sort((a, b) => ecoSavedFor(b.category) - ecoSavedFor(a.category)); break;
    default: items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  res.json({ products: items.map((p) => decorate(p, req.user)), categories: CATEGORIES, conditions: CONDITIONS });
});

// GET /api/products/:id
router.get('/:id', optionalAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p || p.status === 'removed') return res.status(404).json({ error: 'Product not found' });
  db.products.update(p.id, { views: (p.views || 0) + 1 });
  res.json({ product: decorate(p, req.user) });
});

// POST /api/products — create a listing (with image upload + thumbnail).
router.post('/', requireAuth, requireVerified, upload.single('image'), async (req, res) => {
  const { title, description, price, category, condition, location } = req.body || {};
  if (!title || !price || !category) {
    return res.status(400).json({ error: 'Title, price and category are required' });
  }
  if (!CATEGORIES.includes(category)) return res.status(400).json({ error: 'Invalid category' });
  const priceNum = Number(price);
  if (!(priceNum >= 0)) return res.status(400).json({ error: 'Invalid price' });

  let image = null;
  let thumb = null;
  if (req.file) {
    image = `/uploads/${req.file.filename}`;
    thumb = (await makeThumbnail(req.file.path, req.file.filename, UPLOAD_DIR)) || image;
  }
  const product = db.products.insert({
    sellerId: req.user.id,
    title: title.slice(0, 120),
    description: (description || '').slice(0, 4000),
    price: priceNum,
    category,
    condition: CONDITIONS.includes(condition) ? condition : 'Good',
    location: (location || '').slice(0, 80),
    image,
    thumb,
    status: 'available',
    views: 0,
  });
  res.json({ product: decorate(product, req.user) });
});

// PUT /api/products/:id — edit your own listing. Price drops alert watchers.
router.put('/:id', requireAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  if (p.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your listing' });
  }
  const patch = {};
  const { title, description, price, category, condition, location, status } = req.body || {};
  if (title) patch.title = String(title).slice(0, 120);
  if (description !== undefined) patch.description = String(description).slice(0, 4000);
  if (category && CATEGORIES.includes(category)) patch.category = category;
  if (condition && CONDITIONS.includes(condition)) patch.condition = condition;
  if (location !== undefined) patch.location = String(location).slice(0, 80);
  if (status && ['available', 'sold', 'removed'].includes(status)) patch.status = status;

  const oldPrice = p.price; // capture before update mutates the record in place
  let priceDropped = false;
  if (price !== undefined && Number(price) >= 0) {
    if (Number(price) < p.price) priceDropped = true;
    patch.price = Number(price);
  }
  db.products.update(p.id, patch);

  // 🔔 Unique feature: notify everyone watching when the price drops.
  if (priceDropped) {
    db.watchlist.find((w) => w.productId === p.id).forEach((w) => {
      if (w.userId !== req.user.id) {
        notify(
          w.userId,
          'price-drop',
          `Price drop! "${p.title}" is now $${patch.price} (was $${oldPrice})`,
          `/product.html?id=${p.id}`
        );
      }
    });
  }
  res.json({ product: decorate(db.products.byId(p.id), req.user) });
});

// DELETE /api/products/:id — soft remove.
router.delete('/:id', requireAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  if (p.sellerId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not your listing' });
  }
  db.products.update(p.id, { status: 'removed' });
  res.json({ ok: true });
});

// POST /api/products/:id/watch — toggle watchlist.
router.post('/:id/watch', requireAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const existing = db.watchlist.findOne((w) => w.productId === p.id && w.userId === req.user.id);
  if (existing) {
    db.watchlist.remove(existing.id);
    return res.json({ watched: false });
  }
  db.watchlist.insert({ productId: p.id, userId: req.user.id });
  res.json({ watched: true });
});

// POST /api/products/:id/report — flag for admin review.
router.post('/:id/report', requireAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  db.reports.insert({
    productId: p.id,
    reporterId: req.user.id,
    reason: (req.body?.reason || 'Inappropriate').slice(0, 300),
    resolved: false,
  });
  res.json({ ok: true });
});

// POST /api/products/:id/review — buyer reviews a seller after purchase.
router.post('/:id/review', requireAuth, (req, res) => {
  const p = db.products.byId(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  if (p.status !== 'sold' || p.buyerId !== req.user.id) {
    return res.status(403).json({ error: 'You can only review items you have purchased' });
  }
  // If this purchase went through checkout, require it to be delivered first.
  const order = db.orders.findOne((o) => o.productId === p.id && o.buyerId === req.user.id);
  if (order && order.status !== 'delivered') {
    return res.status(403).json({ error: 'You can review once the item is marked delivered' });
  }
  if (db.reviews.findOne((r) => r.productId === p.id && r.buyerId === req.user.id)) {
    return res.status(409).json({ error: 'You already reviewed this purchase' });
  }
  const rating = Math.max(1, Math.min(5, Number(req.body?.rating) || 0));
  db.reviews.insert({
    productId: p.id,
    sellerId: p.sellerId,
    buyerId: req.user.id,
    rating,
    comment: (req.body?.comment || '').slice(0, 500),
  });
  notify(p.sellerId, 'review', `You received a ${rating}★ review`, `/seller.html?id=${p.sellerId}`);
  res.json({ ok: true });
});

// GET /api/products/mine/listings — current user's own listings + sold.
router.get('/mine/listings', requireAuth, (req, res) => {
  const mine = db.products
    .find((p) => p.sellerId === req.user.id && p.status !== 'removed')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((p) => decorate(p, req.user));
  res.json({ products: mine });
});

// GET /api/products/mine/purchases — items the user bought, with review status.
router.get('/mine/purchases', requireAuth, (req, res) => {
  const items = db.products
    .find((p) => p.buyerId === req.user.id && p.status === 'sold')
    .sort((a, b) => (b.soldAt || b.createdAt).localeCompare(a.soldAt || a.createdAt))
    .map((p) => ({
      ...decorate(p, req.user),
      reviewed: !!db.reviews.findOne((r) => r.productId === p.id && r.buyerId === req.user.id),
    }));
  res.json({ products: items });
});

// GET /api/products/mine/watchlist
router.get('/mine/watchlist', requireAuth, (req, res) => {
  const ids = db.watchlist.find((w) => w.userId === req.user.id).map((w) => w.productId);
  const items = db.products
    .find((p) => ids.includes(p.id) && p.status !== 'removed')
    .map((p) => decorate(p, req.user));
  res.json({ products: items });
});

module.exports = router;

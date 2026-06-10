const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { sign, requireAuth } = require('../middleware/auth');
const { publicUser } = require('../lib/helpers');
const { sendVerificationEmail, isDevMode } = require('../lib/mailer');

const router = express.Router();

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const makeToken = () => `${db.genId()}${db.genId()}`;

router.post('/register', async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required' });
  }
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Invalid email' });
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (db.users.findOne((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  // First-ever user becomes admin so the admin panel is reachable out of the box.
  const isFirst = db.users.count() === 0;
  const role = isFirst ? 'admin' : 'user';
  const verifyToken = makeToken();
  const user = db.users.insert({
    name, email, passwordHash, role, bio: '', banned: false,
    verified: isFirst, // bootstrap admin is pre-verified
    verifyToken: isFirst ? null : verifyToken,
  });
  const token = sign(user);
  let sent = { url: null, previewUrl: null };
  if (!isFirst) sent = await sendVerificationEmail(user, verifyToken);
  // The clickable link is returned only in offline/console mode (demo convenience).
  res.json({
    token,
    user: publicUser(user),
    verifyUrl: isDevMode() ? sent.url : null,
    mailPreview: sent.previewUrl, // Ethereal preview, when in test mode
  });
});

// POST /api/auth/verify { token } — confirm an email address.
router.post('/verify', (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: 'Missing token' });
  const user = db.users.findOne((u) => u.verifyToken === token);
  if (!user) return res.status(400).json({ error: 'Invalid or expired verification link' });
  db.users.update(user.id, { verified: true, verifyToken: null });
  res.json({ ok: true, user: publicUser(db.users.byId(user.id)) });
});

// POST /api/auth/resend — re-issue a verification email for the logged-in user.
router.post('/resend', requireAuth, async (req, res) => {
  if (req.user.verified) return res.json({ ok: true, alreadyVerified: true });
  const verifyToken = makeToken();
  db.users.update(req.user.id, { verifyToken });
  const sent = await sendVerificationEmail(req.user, verifyToken);
  res.json({ ok: true, verifyUrl: isDevMode() ? sent.url : null, mailPreview: sent.previewUrl });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.users.findOne((u) => u.email.toLowerCase() === (email || '').toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  if (user.banned) return res.status(403).json({ error: 'This account has been suspended' });
  const token = sign(user);
  res.json({ token, user: publicUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user), addresses: req.user.addresses || [] });
});

/* ----------------------------- saved addresses ----------------------------- */
// Addresses are private to the owner — never exposed via publicUser().
router.get('/addresses', requireAuth, (req, res) => {
  res.json({ addresses: req.user.addresses || [] });
});

router.post('/addresses', requireAuth, (req, res) => {
  const { name, line1, city, zip, country, makeDefault } = req.body || {};
  if (!String(name || '').trim() || !String(line1 || '').trim() || !String(city || '').trim() || !String(zip || '').trim()) {
    return res.status(400).json({ error: 'Name, address, city and ZIP are required' });
  }
  const list = req.user.addresses || [];
  const addr = {
    id: db.genId(),
    name: String(name).slice(0, 80),
    line1: String(line1).slice(0, 120),
    city: String(city).slice(0, 60),
    zip: String(zip).slice(0, 20),
    country: String(country || '').slice(0, 60),
    isDefault: makeDefault || list.length === 0,
  };
  if (addr.isDefault) list.forEach((a) => { a.isDefault = false; });
  list.push(addr);
  db.users.update(req.user.id, { addresses: list });
  res.json({ addresses: list });
});

router.delete('/addresses/:aid', requireAuth, (req, res) => {
  let list = (req.user.addresses || []).filter((a) => a.id !== req.params.aid);
  if (list.length && !list.some((a) => a.isDefault)) list[0].isDefault = true;
  db.users.update(req.user.id, { addresses: list });
  res.json({ addresses: list });
});

router.post('/addresses/:aid/default', requireAuth, (req, res) => {
  const list = req.user.addresses || [];
  if (!list.some((a) => a.id === req.params.aid)) return res.status(404).json({ error: 'Address not found' });
  list.forEach((a) => { a.isDefault = a.id === req.params.aid; });
  db.users.update(req.user.id, { addresses: list });
  res.json({ addresses: list });
});

router.put('/me', requireAuth, (req, res) => {
  const { name, bio } = req.body || {};
  const patch = {};
  if (typeof name === 'string' && name.trim()) patch.name = name.trim();
  if (typeof bio === 'string') patch.bio = bio.slice(0, 500);
  db.users.update(req.user.id, patch);
  res.json({ user: publicUser(db.users.byId(req.user.id)) });
});

// Public seller profile + their active listings + reviews.
router.get('/users/:id', (req, res) => {
  const user = db.users.byId(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const listings = db.products
    .find((p) => p.sellerId === user.id && p.status === 'available')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const reviews = db.reviews
    .find((r) => r.sellerId === user.id)
    .map((r) => ({ ...r, reviewer: db.users.byId(r.buyerId)?.name || 'User' }));
  res.json({ user: publicUser(user), listings, reviews });
});

module.exports = router;

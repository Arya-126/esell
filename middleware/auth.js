const jwt = require('jsonwebtoken');
const db = require('../db');

const SECRET = process.env.JWT_SECRET || 'rewear-dev-secret-change-me';

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role }, SECRET, { expiresIn: '7d' });
}

function readToken(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

// Attaches req.user if a valid token is present; never blocks.
function optionalAuth(req, _res, next) {
  const token = readToken(req);
  if (token) {
    try {
      const payload = jwt.verify(token, SECRET);
      const user = db.users.byId(payload.id);
      if (user && !user.banned) req.user = user;
    } catch {
      /* ignore invalid token */
    }
  }
  next();
}

// Requires a logged-in, non-banned user.
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Requires a verified email. Admins are exempt.
function requireVerified(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required' });
  if (!req.user.verified && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Please verify your email address first', needsVerification: true });
  }
  next();
}

module.exports = { sign, optionalAuth, requireAuth, requireAdmin, requireVerified, SECRET, readToken };

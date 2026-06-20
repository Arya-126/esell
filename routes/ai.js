/**
 * Thin proxy to the AI assistant microservice (ai-service/).
 *
 * The browser only ever talks to this same-origin endpoint, so there's no CORS
 * surface and the microservice URL stays server-side. The logged-in user's JWT
 * is forwarded so the assistant can answer order-status questions as that user.
 *
 * Feature is dark unless AI_SERVICE_URL is set.
 */
const express = require('express');
const { readToken } = require('../middleware/auth');

const router = express.Router();

// Normalise: Render's cross-service host refs omit the scheme — add https://.
const AI_URL = () => {
  let u = (process.env.AI_SERVICE_URL || '').trim();
  if (u && !/^https?:\/\//.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, '');
};
const MAX_LEN = 1000;

// Tiny in-memory rate limiter: N requests per window per key (ip/user).
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();
function rateLimited(key) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(key, arr);
  return arr.length > MAX_PER_WINDOW;
}

async function forward(path, { method = 'GET', body, token } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${AI_URL()}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// GET /api/ai/health — used by the widget to decide whether to show itself.
router.get('/health', async (_req, res) => {
  if (!AI_URL()) return res.json({ enabled: false });
  try {
    const { data } = await forward('/health');
    res.json({ enabled: true, ...data });
  } catch {
    res.json({ enabled: false, error: 'unreachable' });
  }
});

// POST /api/ai/chat — relay a chat turn to the microservice.
router.post('/chat', async (req, res) => {
  if (!AI_URL()) return res.status(503).json({ error: 'AI assistant is not enabled' });

  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Empty message' });
  if (message.length > MAX_LEN) return res.status(400).json({ error: 'Message too long' });

  const key = req.user?.id || req.ip;
  if (rateLimited(key)) return res.status(429).json({ error: 'Slow down a moment and try again.' });

  const sessionId = String(req.body?.sessionId || 'anon').slice(0, 80);
  const productId = req.body?.productId ? String(req.body.productId).slice(0, 80) : undefined;
  try {
    const { status, data } = await forward('/chat', {
      method: 'POST',
      body: { message, sessionId, productId },
      token: readToken(req), // forward the user's JWT (may be null for guests)
    });
    if (status >= 400) return res.status(502).json({ error: data.error || 'Assistant error' });
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'The assistant is unavailable right now. Please try again.' });
  }
});

module.exports = router;

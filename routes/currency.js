const express = require('express');
const db = require('../db');
const fx = require('../lib/currency');

const router = express.Router();

// GET /api/currency — supported currencies, live rates and the viewer's
// detected + selected currency. The client uses this for all price display.
router.get('/', (req, res) => {
  const { selected, detected, detectedFrom } = fx.detectCurrency(req);
  res.json({
    base: fx.BASE,
    currencies: Object.entries(fx.CURRENCIES).map(([code, m]) => ({
      code, symbol: m.symbol, name: m.name, zeroDecimal: !!m.zeroDecimal,
    })),
    rates: fx.rates,
    lastUpdated: fx.lastUpdated,
    source: fx.source, // 'live' or 'fallback'
    selected,
    detected,
    detectedFrom, // 'geo' | 'locale' | 'default'
  });
});

// POST /api/currency — set the viewer's preferred currency (cookie, plus the
// user record when logged in so the preference follows them across devices).
router.post('/', (req, res) => {
  const code = String(req.body?.currency || '').toUpperCase();
  if (!fx.isSupported(code)) return res.status(400).json({ error: 'Unsupported currency' });
  res.cookie('currency', code, { maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax' });
  if (req.user) db.users.update(req.user.id, { currency: code });
  res.json({ ok: true, currency: code });
});

module.exports = router;

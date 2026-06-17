/**
 * Multi-currency engine.
 *
 * Prices are STORED in USD (the base currency); everything else is a
 * presentation/charge-time conversion. Live rates are fetched from a free
 * exchange-rate API (open.er-api.com by default, or exchangerate-api.com v6
 * when EXCHANGE_RATE_API_KEY is set) and refreshed on an interval. A bundled
 * snapshot keeps the app fully working offline.
 *
 * Orders lock their fx rate at creation time so the amount charged never
 * drifts between checkout render and payment confirmation.
 */

const BASE = 'USD';

// code -> { symbol, name, zeroDecimal } (zeroDecimal = no minor units, e.g. ¥)
const CURRENCIES = {
  USD: { symbol: '$', name: 'US Dollar' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'British Pound' },
  INR: { symbol: '₹', name: 'Indian Rupee' },
  JPY: { symbol: '¥', name: 'Japanese Yen', zeroDecimal: true },
  CAD: { symbol: 'CA$', name: 'Canadian Dollar' },
  AUD: { symbol: 'A$', name: 'Australian Dollar' },
  SGD: { symbol: 'S$', name: 'Singapore Dollar' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  CNY: { symbol: 'CN¥', name: 'Chinese Yuan' },
  CHF: { symbol: 'CHF', name: 'Swiss Franc' },
  SEK: { symbol: 'kr', name: 'Swedish Krona' },
  NZD: { symbol: 'NZ$', name: 'New Zealand Dollar' },
  MXN: { symbol: 'MX$', name: 'Mexican Peso' },
  BRL: { symbol: 'R$', name: 'Brazilian Real' },
  ZAR: { symbol: 'R', name: 'South African Rand' },
  KRW: { symbol: '₩', name: 'South Korean Won', zeroDecimal: true },
};

// Offline snapshot (USD -> X). Used until the first live fetch succeeds.
const FALLBACK_RATES = {
  USD: 1, EUR: 0.92, GBP: 0.79, INR: 85.5, JPY: 152, CAD: 1.37, AUD: 1.52,
  SGD: 1.34, AED: 3.67, CNY: 7.21, CHF: 0.88, SEK: 10.45, NZD: 1.66,
  MXN: 18.4, BRL: 5.42, ZAR: 18.1, KRW: 1380,
};

// Country (ISO 3166-1 alpha-2) -> currency, for geo/locale based detection.
const EURO_COUNTRIES = ['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK'];
const COUNTRY_CURRENCY = {
  US: 'USD', GB: 'GBP', UK: 'GBP', IN: 'INR', JP: 'JPY', CA: 'CAD', AU: 'AUD',
  SG: 'SGD', AE: 'AED', CN: 'CNY', CH: 'CHF', SE: 'SEK', NZ: 'NZD', MX: 'MXN',
  BR: 'BRL', ZA: 'ZAR', KR: 'KRW',
};
EURO_COUNTRIES.forEach((c) => { COUNTRY_CURRENCY[c] = 'EUR'; });

const state = {
  rates: { ...FALLBACK_RATES },
  lastUpdated: null, // ISO time of last successful live fetch
  source: 'fallback',
};

function isSupported(code) {
  return !!CURRENCIES[String(code || '').toUpperCase()];
}

function normalize(code) {
  const c = String(code || '').toUpperCase();
  return CURRENCIES[c] ? c : BASE;
}

function rateFor(code) {
  return state.rates[normalize(code)] || 1;
}

// USD -> target currency, rounded to the currency's precision.
function convert(amountUsd, code) {
  const c = normalize(code);
  const raw = Number(amountUsd) * rateFor(c);
  return CURRENCIES[c].zeroDecimal ? Math.round(raw) : Math.round(raw * 100) / 100;
}

// target currency -> USD (used when sellers list in their own currency).
function toUsd(amount, code) {
  const r = rateFor(code);
  return Math.round((Number(amount) / r) * 100) / 100;
}

// Amount in a currency's smallest unit, as Stripe expects.
function toMinorUnits(amount, code) {
  const c = normalize(code);
  return CURRENCIES[c].zeroDecimal ? Math.round(amount) : Math.round(amount * 100);
}

function format(amount, code) {
  const c = normalize(code);
  const meta = CURRENCIES[c];
  const n = meta.zeroDecimal
    ? Math.round(amount).toLocaleString('en-US')
    : Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${meta.symbol}${n}`;
}

/* --------------------------- live rate refresh --------------------------- */

const API_KEY = process.env.EXCHANGE_RATE_API_KEY || '';
const RATES_URL =
  process.env.EXCHANGE_RATE_API_URL ||
  (API_KEY
    ? `https://v6.exchangerate-api.com/v6/${API_KEY}/latest/${BASE}`
    : `https://open.er-api.com/v6/latest/${BASE}`);
const REFRESH_MS = Math.max(5, Number(process.env.FX_REFRESH_MINUTES) || 60) * 60 * 1000;

async function refreshRates() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000);
  try {
    const res = await fetch(RATES_URL, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // open.er-api.com uses `rates`; exchangerate-api.com v6 uses `conversion_rates`.
    const rates = data.rates || data.conversion_rates;
    if (!rates || !rates.EUR) throw new Error('Unexpected rate payload');
    Object.keys(CURRENCIES).forEach((code) => {
      if (Number(rates[code]) > 0) state.rates[code] = Number(rates[code]);
    });
    state.rates[BASE] = 1;
    state.lastUpdated = new Date().toISOString();
    state.source = 'live';
    return true;
  } catch (e) {
    if (state.source === 'fallback') {
      console.warn(`[FX] Live rate fetch failed (${e.message}) — using bundled fallback rates.`);
    }
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Kick off a fetch at boot and keep rates fresh. unref() so it never holds
// the process open (tests, seed scripts).
refreshRates();
const interval = setInterval(refreshRates, REFRESH_MS);
if (interval.unref) interval.unref();

/* ----------------------------- detection ----------------------------- */

// Best-effort country from common CDN/proxy geo headers.
function countryFromHeaders(req) {
  const h = req.headers;
  return (
    h['cf-ipcountry'] || h['x-vercel-ip-country'] || h['x-country-code'] ||
    h['fly-client-ip-country'] || h['x-appengine-country'] || null
  );
}

// Fallback: region subtag of the first Accept-Language locale (e.g. en-IN).
function countryFromAcceptLanguage(req) {
  const al = req.headers['accept-language'];
  if (!al) return null;
  for (const part of al.split(',')) {
    const m = /^[a-z]{2,3}-([A-Za-z]{2})\b/.exec(part.trim());
    if (m) return m[1].toUpperCase();
  }
  return null;
}

/**
 * Resolve the currency for a request, in priority order:
 * explicit cookie > saved user preference > geo header (IP location when
 * deployed behind a CDN) > browser locale region > USD.
 * Returns { selected, detected, detectedFrom }.
 */
function detectCurrency(req) {
  const country = countryFromHeaders(req);
  const localeCountry = countryFromAcceptLanguage(req);
  let detected = BASE;
  let detectedFrom = 'default';
  if (country && COUNTRY_CURRENCY[String(country).toUpperCase()]) {
    detected = COUNTRY_CURRENCY[String(country).toUpperCase()];
    detectedFrom = 'geo';
  } else if (localeCountry && COUNTRY_CURRENCY[localeCountry]) {
    detected = COUNTRY_CURRENCY[localeCountry];
    detectedFrom = 'locale';
  }

  let selected = detected;
  if (req.cookies && isSupported(req.cookies.currency)) {
    selected = normalize(req.cookies.currency);
  } else if (req.user && isSupported(req.user.currency)) {
    selected = normalize(req.user.currency);
  }
  return { selected, detected, detectedFrom };
}

module.exports = {
  BASE,
  CURRENCIES,
  isSupported,
  normalize,
  rateFor,
  convert,
  toUsd,
  toMinorUnits,
  format,
  refreshRates,
  detectCurrency,
  get rates() { return { ...state.rates }; },
  get lastUpdated() { return state.lastUpdated; },
  get source() { return state.source; },
};

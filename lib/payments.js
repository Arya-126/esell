/**
 * Payment layer. Uses real Stripe when STRIPE_SECRET_KEY is configured,
 * otherwise a deterministic in-process stub so the app works offline.
 *
 * The stub validates a fake card (Luhn) and "charges" instantly; the Stripe
 * path creates a PaymentIntent the client confirms with Stripe.js, then the
 * server verifies it succeeded before fulfilling the order.
 */
const fx = require('./currency');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_PUBLISHABLE = process.env.STRIPE_PUBLISHABLE_KEY || '';

let stripe = null;
if (STRIPE_SECRET) {
  try {
    stripe = require('stripe')(STRIPE_SECRET);
  } catch (e) {
    console.error('[PAY] Stripe init failed, falling back to stub:', e.message);
    stripe = null;
  }
}

const enabled = !!stripe;

/* ----------------------------- stub card logic ----------------------------- */
function luhnValid(num) {
  let sum = 0, alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let d = parseInt(num[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d; alt = !alt;
  }
  return sum % 10 === 0;
}
function cardBrand(num) {
  if (/^4/.test(num)) return 'Visa';
  if (/^5[1-5]/.test(num)) return 'Mastercard';
  if (/^3[47]/.test(num)) return 'Amex';
  if (/^6/.test(num)) return 'Discover';
  return 'Card';
}
function validateStubCard(card) {
  if (!card) return { ok: false, error: 'Payment details required' };
  const num = String(card.number || '').replace(/[\s-]/g, '');
  if (!/^\d{13,19}$/.test(num)) return { ok: false, error: 'Card number must be 13–19 digits' };
  if (!luhnValid(num)) return { ok: false, error: 'Card number failed validation (try 4242 4242 4242 4242)' };
  if (!/^\d{3,4}$/.test(String(card.cvc || ''))) return { ok: false, error: 'Invalid CVC' };
  const m = /^(\d{2})\s*\/\s*(\d{2})$/.exec(String(card.exp || '').trim());
  if (!m) return { ok: false, error: 'Expiry must be MM/YY' };
  const month = Number(m[1]);
  if (month < 1 || month > 12) return { ok: false, error: 'Invalid expiry month' };
  return { ok: true, last4: num.slice(-4), brand: cardBrand(num) };
}

/* ------------------------------- Stripe path ------------------------------- */
// Create a PaymentIntent. `amount` is in major units of `currency`
// (e.g. 12.50 EUR, 1500 JPY) — converted to minor units per Stripe's rules.
async function createPaymentIntent(amount, metadata = {}, currency = 'USD') {
  if (!stripe) throw new Error('Stripe not configured');
  const pi = await stripe.paymentIntents.create({
    amount: fx.toMinorUnits(amount, currency),
    currency: fx.normalize(currency).toLowerCase(),
    automatic_payment_methods: { enabled: true },
    metadata,
  });
  return { id: pi.id, clientSecret: pi.client_secret };
}

// Verify a PaymentIntent actually succeeded; return charge card details.
async function confirmPaymentIntent(paymentIntentId, expectedAmount, currency = 'USD') {
  if (!stripe) throw new Error('Stripe not configured');
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId, { expand: ['latest_charge'] });
  if (pi.status !== 'succeeded') return { ok: false, error: `Payment not completed (status: ${pi.status})` };
  if (pi.currency !== fx.normalize(currency).toLowerCase()) {
    return { ok: false, error: 'Payment currency mismatch' };
  }
  if (expectedAmount != null && pi.amount !== fx.toMinorUnits(expectedAmount, currency)) {
    return { ok: false, error: 'Payment amount mismatch' };
  }
  const card = pi.latest_charge?.payment_method_details?.card;
  return { ok: true, last4: card?.last4 || '••••', brand: card ? card.brand[0].toUpperCase() + card.brand.slice(1) : 'Card', paymentIntentId: pi.id };
}

async function refund(paymentIntentId) {
  if (!stripe) return { ok: true, stub: true }; // stub refunds are instant no-ops
  if (!paymentIntentId) return { ok: true, stub: true };
  try {
    await stripe.refunds.create({ payment_intent: paymentIntentId });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  enabled,
  publishableKey: STRIPE_PUBLISHABLE,
  validateStubCard,
  createPaymentIntent,
  confirmPaymentIntent,
  refund,
};

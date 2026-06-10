/**
 * Email sender with three modes, chosen automatically:
 *   1. Production SMTP  — when SMTP_HOST is set.
 *   2. Ethereal test    — when MAIL_TEST=true (real send to a viewable test inbox;
 *                         each message returns a preview URL). Needs network.
 *   3. Console dev mode  — fallback; logs the message + verification link offline.
 */
let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { nodemailer = null; }

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const FROM = process.env.MAIL_FROM || 'ReWear <no-reply@rewear.dev>';

let transporterPromise = null;
let mode = 'console';

function initTransporter() {
  if (transporterPromise) return transporterPromise;
  transporterPromise = (async () => {
    if (!nodemailer) return null;
    if (process.env.SMTP_HOST) {
      mode = 'smtp';
      return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
    }
    if (process.env.MAIL_TEST === 'true') {
      try {
        const acct = await nodemailer.createTestAccount();
        mode = 'ethereal';
        console.log(`  ✉️  Ethereal test inbox ready (user: ${acct.user}). Email preview links will be logged.`);
        return nodemailer.createTransport({
          host: 'smtp.ethereal.email', port: 587, secure: false,
          auth: { user: acct.user, pass: acct.pass },
        });
      } catch (e) {
        console.error('[MAIL] Ethereal setup failed, using console mode:', e.message);
      }
    }
    return null;
  })();
  return transporterPromise;
}

async function sendMail({ to, subject, text, html }) {
  const transporter = await initTransporter();
  if (transporter) {
    try {
      const info = await transporter.sendMail({ from: FROM, to, subject, text, html });
      const preview = nodemailer.getTestMessageUrl ? nodemailer.getTestMessageUrl(info) : null;
      if (preview) console.log(`  ✉️  [${mode}] sent to ${to} — preview: ${preview}`);
      return { delivered: true, previewUrl: preview || null };
    } catch (e) {
      console.error('[MAIL] send failed:', e.message);
    }
  }
  console.log(`\n  ✉️  [DEV MAIL] To: ${to}\n     Subject: ${subject}\n     ${text || ''}\n`);
  return { delivered: false, previewUrl: null };
}

function verificationUrl(token) {
  return `${APP_URL}/verify.html?token=${token}`;
}

async function sendVerificationEmail(user, token) {
  const url = verificationUrl(token);
  const res = await sendMail({
    to: user.email,
    subject: 'Verify your ReWear account',
    text: `Welcome to ReWear! Confirm your email to start buying and selling:\n${url}`,
    html: `<h2>Welcome to ReWear 🛍️</h2><p>Confirm your email to start buying and selling.</p>
           <p><a href="${url}" style="background:#2ecc71;color:#08130c;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700">Verify my email</a></p>
           <p>Or paste this link: ${url}</p>`,
  });
  return { url, previewUrl: res.previewUrl };
}

async function sendOrderEmail(user, order, product) {
  return sendMail({
    to: user.email,
    subject: `Order confirmed: ${product.title}`,
    text: `Your payment of $${order.amount} for "${product.title}" was received. Order #${order.id}.`,
  });
}

// True only when emails are NOT actually delivered (so callers expose the dev link).
function isDevMode() {
  return mode === 'console';
}

module.exports = { sendMail, sendVerificationEmail, sendOrderEmail, verificationUrl, APP_URL, isDevMode };

# 🛍️ ReWear — Sustainable Resell Marketplace

A full-stack second-hand marketplace where people buy & sell pre-loved goods, chat
in real time, haggle with built-in offers, and see the environmental impact of every deal.

Built with **Node + Express + Socket.io** and a zero-native-dependency JSON datastore,
so it installs and runs anywhere (including Windows) with no database setup.

## Features

### Core
- 🔐 **Accounts** — register / login with hashed passwords (bcrypt) + JWT sessions
- ✉️ **Email verification** — new users confirm their address before they can buy or sell
  (real SMTP when configured, console + dev-link fallback otherwise)
- 🏷️ **Sell** — upload a photo, description, price, category & condition
- 🖼️ **Image thumbnails** — uploads are auto-downscaled (pure-JS Jimp) so grids load fast
  while product pages keep the full image
- 🛒 **Browse** — search, filter by category/condition/price, and sort
- 💱 **Multi-currency catalog** — prices are stored in USD and shown to every visitor in
  their own currency (17 supported, incl. EUR, GBP, INR, JPY) using **live exchange
  rates** refreshed hourly from a free exchange-rate API (offline fallback snapshot
  included). The viewer's currency is **auto-detected from their location** (CDN geo
  headers, then browser locale) and can be overridden with the navbar picker — the
  choice is remembered per user. Sellers can list in their own currency too.
- 🛒 **Shopping cart** — add multiple one-of-a-kind items, then check out with a
  **single payment** that covers all of them (each seller still ships separately)
- 💳 **Checkout & orders** — Buy Now, cart checkout, or pay an accepted offer.
  **Real Stripe** when keys are configured (PaymentIntents + Stripe Elements,
  **charged in the buyer's currency** with the fx rate locked at checkout), or a
  Luhn-validated demo stub otherwise — full numbers are never stored. Full order
  lifecycle: *pending → paid → shipped → delivered*, with seller fulfilment and buyer
  delivery confirmation
- 🧾 **Transaction history** — a dedicated page with every payment in/out, totals
  spent/earned, payment method, currency + locked fx rate, tracking numbers and a
  status timeline for each order
- 🧾 **PDF receipts** — every paid order has a downloadable receipt (generated with pdfkit)
- ↩️ **Refunds & disputes** — buyers open a dispute / request a refund; sellers or admins
  approve (issuing a real Stripe refund when live) or decline; admins get a disputes queue
- 📍 **Saved addresses** — buyers store multiple shipping addresses and pick one at checkout
- 💬 **Real-time chat** — buyers and sellers message live (Socket.io) with typing indicators
- 🛡️ **Admin console** — stats, category chart, user banning, listing takedowns, report queue

### Unique extras (things most resell sites lack)
- 🌱 **EcoSaver** — every listing shows the CO₂ saved by buying used vs new; users get a
  personal "green impact" score on their dashboard and profile.
- 🤝 **Built-in negotiation** — buyers make offers; sellers **accept / decline / counter**
  right inside the chat thread. Accepting marks the item sold at the agreed price.
- ⭐ **Trust scores & reviews** — buyers review sellers after a sale; sellers earn a
  trust badge from ratings + sales volume.
- 🔔 **Price-drop watchlist** — watch any item and get a real-time alert the moment the
  seller lowers the price.
- 📊 **Fair-price indicator** — listings are flagged *Great deal / Fair / Above average*
  versus the live average price in their category.
- 🤖 **AI shopping assistant (Advanced RAG)** — an optional floating chat widget backed by a
  separate **FastAPI + LangGraph + Qdrant** microservice (`ai-service/`). A single
  *Query Router* powers both a conversational **personal shopper** ("a warm winter jacket
  under $50" → grounded product cards) and **customer support** (FAQ/policy answers +
  "where is my order?"). Includes a **Self-RAG** loop (grades retrieved context and rewrites
  the query on a miss) and **guardrails** for unsafe/off-topic input. Runs cost-free by
  default (local embeddings + heuristic fallback), with Google Gemini, or with your **own
  self-hosted LLM** ([`llm-api/`](llm-api) — FastAPI + HuggingFace Transformers) via a
  pluggable provider. The widget stays hidden unless `AI_SERVICE_URL` is set, so the core
  app is unaffected. See [ai-service/README.md](ai-service/README.md).

## Quick start

```bash
npm install        # already done
npm run seed       # optional: load demo users + listings
npm start          # http://localhost:3000
```

Then open **http://localhost:3000**.

- **No seed?** The **first account you register becomes the admin.**
- **Seeded?** Login as `admin@rewear.dev` / `password123` (admin) or
  `maya@ / leo@ / sara@ rewear.dev` (all `password123`).

## Project layout

```
server.js            Express + Socket.io entry point
db.js                Tiny JSON-file datastore (collections, no native deps)
seed.js              Demo data loader
lib/helpers.js       Eco / trust / fair-price domain logic
lib/currency.js      Multi-currency engine: live fx rates, conversion, geo detection
lib/payments.js      Stripe layer (currency-aware PaymentIntents) + demo stub
middleware/auth.js   JWT auth (Bearer + cookie), role + verified guards
lib/mailer.js        Email (nodemailer if SMTP_* set, else dev console)
lib/images.js        Jimp thumbnail generation
routes/              auth · products · cart · currency · chat · offers · orders · admin · notifications · ai (proxy)
public/              Frontend (vanilla JS, no build step) — incl. js/ai-widget.js
data/                Auto-created JSON storage (git-ignore this)
uploads/             Auto-created product images
ai-service/          Optional Python RAG microservice (FastAPI · LangGraph · Qdrant)
llm-api/             Optional self-hosted LLM server (FastAPI · HuggingFace Transformers)
```

## Contributing (open-source roadmap)

The codebase is deliberately small and dependency-light so it's easy to extend.
Great first contributions:

- **Payment methods** — `lib/payments.js` isolates the payment provider; add
  PayPal, Razorpay, etc. behind the same `createPaymentIntent` / `confirm` / `refund`
  interface and expose it via `/api/config`.
- **More currencies / language support** — add entries to `CURRENCIES` and
  `COUNTRY_CURRENCY` in `lib/currency.js`; UI strings live in the `public/*.html`
  pages and are straightforward to externalise into a locale file.
- **Product recommendations** — `lib/helpers.js` already computes category/price
  signals; a "similar items" endpoint + carousel on `product.html` is a neat,
  self-contained feature.

## Payment & email (test/demo)
- **Checkout is a stub** — no real money moves. Use test card `4242 4242 4242 4242`,
  any future `MM/YY` expiry, any 3–4 digit CVC. Only the brand + last 4 digits are stored.
- **Email** logs to the server console by default and the verification link is returned to
  the UI so the demo works fully offline. To send real mail, set the SMTP env vars below.

## Environment variables (all optional)
| Var | Purpose |
|-----|---------|
| `PORT` | server port (default 3000) |
| `JWT_SECRET` | sign tokens (set a strong value in production) |
| `APP_URL` | base URL used in email links (default `http://localhost:3000`) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_SECURE` `MAIL_FROM` | enable real email |
| `STRIPE_SECRET_KEY` `STRIPE_PUBLISHABLE_KEY` | enable real Stripe payments |
| `EXCHANGE_RATE_API_KEY` | use exchangerate-api.com v6 for live fx rates (default: open.er-api.com, no key) |
| `EXCHANGE_RATE_API_URL` | custom rates endpoint returning `{ rates: {...} }` per 1 USD |
| `FX_REFRESH_MINUTES` | live-rate refresh interval (default 60) |

## Deployment

The app is a single Node process that serves both the API and the static frontend, so it
runs anywhere Node runs. It binds to `process.env.PORT` and sets `trust proxy`.

**Any Node host (Render / Railway / Fly / a VPS):**
```bash
npm install --omit=dev
NODE_ENV=production JWT_SECRET=$(openssl rand -hex 32) node server.js
```
Set the environment variables from `.env.example`. In production the server refuses to
start without `JWT_SECRET`.

**Docker:**
```bash
docker build -t rewear .
docker run -p 3000:3000 \
  -e JWT_SECRET=your-long-secret \
  -e NODE_ENV=production \
  -v $(pwd)/data:/app/data -v $(pwd)/uploads:/app/uploads \
  rewear
```

**Persistence:** app data is JSON under `data/` and images under `uploads/`. Mount both as
volumes (as shown) so they survive restarts/redeploys — on ephemeral platforms a restart
otherwise wipes them. For multi-instance scale you'd move these to a database + object
store; the data layer is isolated in `db.js` to make that swap straightforward.

**Going live with payments/email:** set the Stripe and SMTP variables in `.env.example`.
With Stripe keys present the checkout automatically switches from the demo stub to real
Stripe Elements and processes real refunds.

## Notes
- Images are stored on disk under `uploads/`; data lives as JSON under `data/`.

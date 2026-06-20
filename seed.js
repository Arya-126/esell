/* Loads a rich demo dataset so the marketplace (and the AI assistant) feel real.
   Run:  npm run seed   (wipes data/ first)

   Catalog data lives in seed-catalog.js. Each product uses its fetched photo at
   /seed-assets/products/<slug>.jpg when present (run `node fetch-images.js`),
   otherwise a committed category fallback image — so it always works, even on a
   host with an ephemeral filesystem (e.g. Render) with no uploads volume. */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });

const db = require('./db'); // recreates data dir
const { SELLER_DEFS, CATALOG, slugify } = require('./seed-catalog');

const PRODUCTS_IMG_DIR = path.join(__dirname, 'public', 'seed-assets', 'products');
const hash = (pw) => bcrypt.hashSync(pw, 10);
const V = { verified: true, verifyToken: null }; // seeded users are pre-verified
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const now = new Date().toISOString();

// Per-product fetched photo if it exists, else the category fallback image.
function productImage(title, fallbacks, i) {
  const slug = slugify(title);
  if (fs.existsSync(path.join(PRODUCTS_IMG_DIR, `${slug}.jpg`))) {
    return `/seed-assets/products/${slug}.jpg`;
  }
  return fallbacks[i % fallbacks.length];
}

/* ------------------------------- users ------------------------------- */
db.users.insert({ name: 'Site Admin', email: 'admin@rewear.dev', passwordHash: hash('password123'), role: 'admin', bio: 'Keeping ReWear friendly.', banned: false, ...V });

const sellers = SELLER_DEFS.map(([name, local, city, bio]) => ({
  user: db.users.insert({ name, email: `${local}@rewear.dev`, passwordHash: hash('password123'), role: 'user', bio, banned: false, ...V }),
  city,
}));

/* --------------------------- insert products --------------------------- */
const products = [];
let idx = 0;
for (const [category, { images, items }] of Object.entries(CATALOG)) {
  items.forEach(([title, description, price, condition], i) => {
    const seller = sellers[idx % sellers.length];
    const img = productImage(title, images, i);
    products.push(
      db.products.insert({
        id: slugify(title), // stable id across reseeds -> AI index stays valid
        sellerId: seller.user.id,
        title,
        description,
        price,
        category,
        condition,
        location: seller.city,
        image: img,
        thumb: img,
        status: 'available',
        views: Math.floor(Math.random() * 60),
      })
    );
    idx += 1;
  });
}

/* ----------------------- orders / reviews / trust ----------------------- */
const REVIEW_COMMENTS = [
  'Smooth transaction, item exactly as described. Highly recommend!',
  'Fast shipping and well packaged. Thank you!',
  'Great communication and a fair price.',
  'Item was even better than the photos. Very happy.',
  'Friendly seller, would buy from again.',
  'Arrived quickly and works perfectly.',
];
const BRANDS = [['Visa', '4242'], ['Mastercard', '4444'], ['Amex', '0005']];

function otherUser(notId) {
  let u = pick(sellers);
  while (u.user.id === notId) u = pick(sellers);
  return u;
}

products.forEach((p, i) => {
  if (i % 7 === 3) {
    // Delivered sale + review -> populates seller trust scores.
    const buyer = otherUser(p.sellerId);
    const [brand, last4] = pick(BRANDS);
    db.products.update(p.id, { status: 'sold', buyerId: buyer.user.id, soldPrice: p.price, soldAt: now });
    db.orders.insert({
      productId: p.id, buyerId: buyer.user.id, sellerId: p.sellerId, amount: p.price, status: 'delivered',
      shipping: { name: buyer.user.name, line1: '1 Demo St', city: buyer.city.split(',')[0], zip: '10001', country: 'USA' },
      payment: { brand, last4, paidAt: now }, shippedAt: now, deliveredAt: now, refundStatus: 'none',
    });
    db.reviews.insert({ productId: p.id, sellerId: p.sellerId, buyerId: buyer.user.id, rating: 4 + (i % 2), comment: pick(REVIEW_COMMENTS) });
  } else if (i % 19 === 5) {
    // Paid, awaiting shipment -> sellers have something to fulfil.
    const buyer = otherUser(p.sellerId);
    const [brand, last4] = pick(BRANDS);
    db.products.update(p.id, { status: 'sold', buyerId: buyer.user.id, soldPrice: p.price, soldAt: now });
    db.orders.insert({
      productId: p.id, buyerId: buyer.user.id, sellerId: p.sellerId, amount: p.price, status: 'paid',
      shipping: { name: buyer.user.name, line1: '2 Demo Ave', city: buyer.city.split(',')[0], zip: '20002', country: 'USA' },
      payment: { brand, last4, paidAt: now }, refundStatus: 'none',
    });
  }
});

/* ------------------------ a couple of live threads ------------------------ */
const open = products.filter((p) => p.status === 'available');
for (let k = 0; k < 3; k++) {
  const p = open[k * 5];
  if (!p) break;
  const buyer = otherUser(p.sellerId);
  const convo = db.conversations.insert({ productId: p.id, buyerId: buyer.user.id, sellerId: p.sellerId });
  db.messages.insert({ conversationId: convo.id, senderId: buyer.user.id, text: `Hi! Is the ${p.title} still available?`, read: true });
  db.messages.insert({ conversationId: convo.id, senderId: p.sellerId, text: 'Yes it is — happy to answer any questions!', read: false });
  db.offers.insert({ productId: p.id, buyerId: buyer.user.id, sellerId: p.sellerId, amount: Math.max(1, Math.round(p.price * 0.85)), status: 'pending', from: 'buyer' });
}

db.flushSync();

const withPhoto = products.filter((p) => p.image.includes('/products/')).length;
console.log('\n  ✅ Seed complete.');
console.log(`     ${db.users.count()} users (1 admin + ${sellers.length} sellers)`);
console.log(`     ${db.products.count()} products  (${db.products.count((p) => p.status === 'available')} available, ${db.products.count((p) => p.status === 'sold')} sold)`);
console.log(`     ${withPhoto}/${products.length} products using a fetched photo (rest use category fallback)`);
console.log(`     ${db.orders.count()} orders, ${db.reviews.count()} reviews`);
console.log('\n  Admin login:  admin@rewear.dev / password123');
console.log('  Any seller:   maya@ / leo@ / sara@ ... rewear.dev  (all password123)\n');
process.exit(0);

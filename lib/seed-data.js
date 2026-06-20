/* Reusable demo-data seeding: inserts users, products, orders, reviews and a few
   chats into the given db. No wipe, no process.exit — the caller controls
   lifecycle. Used by seed.js (CLI: wipes first) and server.js (seed-if-empty on
   boot when AUTO_SEED=true). */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { SELLER_DEFS, CATALOG, slugify } = require('../seed-catalog');

const PRODUCTS_IMG_DIR = path.join(__dirname, '..', 'public', 'seed-assets', 'products');

// Per-product fetched photo if present, else the category fallback image.
function productImage(title, fallbacks, i) {
  const slug = slugify(title);
  if (fs.existsSync(path.join(PRODUCTS_IMG_DIR, `${slug}.jpg`))) {
    return `/seed-assets/products/${slug}.jpg`;
  }
  return fallbacks[i % fallbacks.length];
}

const REVIEW_COMMENTS = [
  'Smooth transaction, item exactly as described. Highly recommend!',
  'Fast shipping and well packaged. Thank you!',
  'Great communication and a fair price.',
  'Item was even better than the photos. Very happy.',
  'Friendly seller, would buy from again.',
  'Arrived quickly and works perfectly.',
];
const BRANDS = [['Visa', '4242'], ['Mastercard', '4444'], ['Amex', '0005']];

function seed(db) {
  const hash = (pw) => bcrypt.hashSync(pw, 10);
  const V = { verified: true, verifyToken: null }; // seeded users are pre-verified
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const now = new Date().toISOString();

  /* users */
  db.users.insert({ name: 'Site Admin', email: 'admin@rewear.dev', passwordHash: hash('password123'), role: 'admin', bio: 'Keeping ReWear friendly.', banned: false, ...V });
  const sellers = SELLER_DEFS.map(([name, local, city, bio]) => ({
    user: db.users.insert({ name, email: `${local}@rewear.dev`, passwordHash: hash('password123'), role: 'user', bio, banned: false, ...V }),
    city,
  }));

  /* products (stable slug ids so reseeds keep the same ids) */
  const products = [];
  let idx = 0;
  for (const [category, { images, items }] of Object.entries(CATALOG)) {
    items.forEach(([title, description, price, condition], i) => {
      const seller = sellers[idx % sellers.length];
      const img = productImage(title, images, i);
      products.push(db.products.insert({
        id: slugify(title),
        sellerId: seller.user.id,
        title, description, price, category, condition,
        location: seller.city, image: img, thumb: img,
        status: 'available', views: Math.floor(Math.random() * 60),
      }));
      idx += 1;
    });
  }

  function otherUser(notId) {
    let u = pick(sellers);
    while (u.user.id === notId) u = pick(sellers);
    return u;
  }

  /* orders / reviews -> trust scores + order history */
  products.forEach((p, i) => {
    if (i % 7 === 3) {
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

  /* a few live chat threads + offers */
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

  return {
    sellers: sellers.length,
    users: db.users.count(),
    products: db.products.count(),
    available: db.products.count((x) => x.status === 'available'),
    sold: db.products.count((x) => x.status === 'sold'),
    withPhoto: products.filter((x) => x.image.includes('/products/')).length,
    total: products.length,
    orders: db.orders.count(),
    reviews: db.reviews.count(),
  };
}

module.exports = { seed };

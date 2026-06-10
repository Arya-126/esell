/* Loads demo data so you can explore the app immediately.
   Run:  npm run seed   (wipes data/ first)                    */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });

const db = require('./db'); // recreates data dir
const { generatePlaceholder, makeThumbnail } = require('./lib/images');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const hash = (pw) => bcrypt.hashSync(pw, 10);

const V = { verified: true, verifyToken: null }; // seeded users are pre-verified
const admin = db.users.insert({ name: 'Site Admin', email: 'admin@rewear.dev', passwordHash: hash('password123'), role: 'admin', bio: 'Keeping ReWear friendly.', banned: false, ...V });
const maya = db.users.insert({ name: 'Maya Chen', email: 'maya@rewear.dev', passwordHash: hash('password123'), role: 'user', bio: 'Decluttering my apartment. Everything priced to go!', banned: false, ...V });
const leo = db.users.insert({ name: 'Leo Park', email: 'leo@rewear.dev', passwordHash: hash('password123'), role: 'user', bio: 'Vintage tech & guitars.', banned: false, ...V });
const sara = db.users.insert({ name: 'Sara Idris', email: 'sara@rewear.dev', passwordHash: hash('password123'), role: 'user', bio: '', banned: false, ...V });

const demo = [
  [maya, 'Mid-century walnut coffee table', 'Solid walnut, a few light scratches on top but very sturdy. Pickup only.', 120, 'Furniture', 'Good', 'Brooklyn, NY'],
  [maya, 'IKEA desk lamp', 'Works perfectly, warm LED bulb included.', 12, 'Home', 'Like New', 'Brooklyn, NY'],
  [leo, 'Sony WH-1000XM3 headphones', 'Excellent noise cancelling. Comes with case and cable.', 95, 'Electronics', 'Good', 'Queens, NY'],
  [leo, 'Fender Squier Stratocaster', 'Great starter electric guitar. Set up with fresh strings.', 160, 'Other', 'Good', 'Queens, NY'],
  [leo, 'Kindle Paperwhite (10th gen)', 'Backlit, waterproof. Battery still lasts weeks.', 55, 'Electronics', 'Like New', 'Queens, NY'],
  [sara, 'Patagonia fleece jacket (M)', 'Cozy and barely worn. Smoke-free home.', 40, 'Clothing', 'Like New', 'Jersey City, NJ'],
  [sara, 'Box of sci-fi paperbacks (12)', 'Asimov, Le Guin, Herbert and more. Take the lot.', 18, 'Books', 'Good', 'Jersey City, NJ'],
  [sara, 'Wooden train set', "Kids outgrew it. Tracks + 6 carriages.", 22, 'Toys', 'Good', 'Jersey City, NJ'],
  [maya, 'Yoga mat + blocks', 'Lightly used, cleaned and rolled.', 15, 'Sports', 'Good', 'Brooklyn, NY'],
  [leo, 'Mechanical keyboard (brown switches)', 'Tactile and quiet-ish. USB-C, no software needed.', 48, 'Electronics', 'Good', 'Queens, NY'],
];

const products = demo.map(([seller, title, description, price, category, condition, location]) =>
  db.products.insert({ sellerId: seller.id, title, description, price, category, condition, location, image: null, status: 'available', views: Math.floor(price) % 40 })
);

// Real demo photos (fetched from the web) bundled under public/seed-assets/.
// Index matches the `demo` array order above. Falls back to a generated text
// card if an asset is missing, so the seeder always works offline.
const ASSETS_DIR = path.join(__dirname, 'public', 'seed-assets');
const SLUGS = ['coffee-table', 'desk-lamp', 'headphones', 'guitar', 'kindle', 'fleece-jacket', 'books', 'train', 'yoga-mat', 'keyboard'];

(async () => {
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    let ext = '.jpg';
    let assetPath = path.join(ASSETS_DIR, `${SLUGS[i]}.jpg`);
    if (!fs.existsSync(assetPath)) {
      assetPath = path.join(ASSETS_DIR, `${SLUGS[i]}.png`);
      ext = '.png';
    }
    let filename, abs;
    if (fs.existsSync(assetPath)) {
      filename = `seed-${p.id}${ext}`;
      abs = path.join(UPLOAD_DIR, filename);
      fs.copyFileSync(assetPath, abs); // copy the real photo into uploads/
    } else {
      filename = `seed-${p.id}.png`;
      abs = path.join(UPLOAD_DIR, filename);
      if (!(await generatePlaceholder(p.title, p.category, abs))) continue;
    }
    const thumb = (await makeThumbnail(abs, filename, UPLOAD_DIR)) || `/uploads/${filename}`;
    db.products.update(p.id, { image: `/uploads/${filename}`, thumb });
  }
  finish();
})();

function finish() {

// A completed sale (delivered order) + review so trust scores have data.
const now = new Date().toISOString();
db.products.update(products[2].id, { status: 'sold', buyerId: sara.id, soldPrice: 85, soldAt: now });
db.orders.insert({ productId: products[2].id, buyerId: sara.id, sellerId: leo.id, amount: 85, status: 'delivered',
  shipping: { name: 'Sara Idris', line1: '5 River Rd', city: 'Jersey City', zip: '07302', country: 'USA' },
  payment: { brand: 'Visa', last4: '4242', paidAt: now }, shippedAt: now, deliveredAt: now });
db.reviews.insert({ productId: products[2].id, sellerId: leo.id, buyerId: sara.id, rating: 5, comment: 'Smooth pickup, headphones are mint. Highly recommend!' });

// A paid order awaiting shipment (so Maya, the seller, has something to fulfil).
db.products.update(products[8].id, { status: 'sold', buyerId: leo.id, soldPrice: 15, soldAt: now });
db.orders.insert({ productId: products[8].id, buyerId: leo.id, sellerId: maya.id, amount: 15, status: 'paid',
  shipping: { name: 'Leo Park', line1: '88 Vine St', city: 'Queens', zip: '11101', country: 'USA' },
  payment: { brand: 'Mastercard', last4: '4444', paidAt: now } });

// An in-progress negotiation + chat thread.
const convo = db.conversations.insert({ productId: products[0].id, buyerId: leo.id, sellerId: maya.id });
db.messages.insert({ conversationId: convo.id, senderId: leo.id, text: 'Hi! Is the coffee table still available?', read: true });
db.messages.insert({ conversationId: convo.id, senderId: maya.id, text: 'Yes it is! Happy to hold it for pickup this weekend.', read: false });
db.offers.insert({ productId: products[0].id, buyerId: leo.id, sellerId: maya.id, amount: 100, status: 'pending', from: 'buyer' });

console.log('\n  ✅ Seed complete (with generated product images).');
console.log('  Admin login:  admin@rewear.dev / password123');
console.log('  Users:        maya@ / leo@ / sara@ rewear.dev  (all password123)\n');
db.flushSync(); // ensure all writes hit disk before we exit
process.exit(0);
}

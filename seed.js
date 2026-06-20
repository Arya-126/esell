/* CLI: wipe data/ and load the full demo dataset.
   Run:  npm run seed

   For seed-on-empty at boot (no wipe), set AUTO_SEED=true and start the server;
   see lib/seed-data.js, which holds the shared seeding logic. */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (fs.existsSync(DATA_DIR)) fs.rmSync(DATA_DIR, { recursive: true, force: true });

const db = require('./db'); // recreates data dir
const { seed } = require('./lib/seed-data');

const c = seed(db);
db.flushSync();

console.log('\n  ✅ Seed complete.');
console.log(`     ${c.users} users (1 admin + ${c.sellers} sellers)`);
console.log(`     ${c.products} products  (${c.available} available, ${c.sold} sold)`);
console.log(`     ${c.withPhoto}/${c.total} products using a fetched photo (rest use category fallback)`);
console.log(`     ${c.orders} orders, ${c.reviews} reviews`);
console.log('\n  Admin login:  admin@rewear.dev / password123');
console.log('  Any seller:   maya@ / leo@ / sara@ ... rewear.dev  (all password123)\n');
process.exit(0);

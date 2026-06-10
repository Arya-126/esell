/**
 * Tiny zero-dependency JSON datastore.
 * Each collection is an array persisted to data/<name>.json.
 * Writes are debounced so rapid mutations don't thrash the disk.
 * This keeps the whole app native-dependency-free (great on Windows).
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const COLLECTIONS = [
  'users',
  'products',
  'conversations',
  'messages',
  'offers',
  'reviews',
  'watchlist',
  'notifications',
  'reports',
  'orders',
];

const store = {};
const writeTimers = {};

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function load(name) {
  try {
    const raw = fs.readFileSync(fileFor(name), 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function persist(name) {
  clearTimeout(writeTimers[name]);
  writeTimers[name] = setTimeout(() => {
    fs.writeFile(fileFor(name), JSON.stringify(store[name], null, 2), () => {});
  }, 50);
}

// Synchronously write every collection to disk. Used on process exit and by seed.js
// so pending debounced writes are never lost.
function flushSync() {
  COLLECTIONS.forEach((name) => {
    clearTimeout(writeTimers[name]);
    try {
      fs.writeFileSync(fileFor(name), JSON.stringify(store[name], null, 2));
    } catch {
      /* best effort */
    }
  });
}

// Boot: load every collection into memory.
COLLECTIONS.forEach((name) => {
  store[name] = load(name);
});

let counter = Date.now();
function genId() {
  // Monotonic-ish unique id, sortable by creation.
  counter += 1;
  return `${counter.toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function collection(name) {
  if (!store[name]) throw new Error(`Unknown collection: ${name}`);
  return {
    all() {
      return store[name];
    },
    find(pred) {
      return store[name].filter(pred);
    },
    findOne(pred) {
      return store[name].find(pred);
    },
    byId(id) {
      return store[name].find((r) => r.id === id);
    },
    insert(doc) {
      const record = { id: genId(), createdAt: new Date().toISOString(), ...doc };
      store[name].push(record);
      persist(name);
      return record;
    },
    update(id, patch) {
      const rec = store[name].find((r) => r.id === id);
      if (!rec) return null;
      Object.assign(rec, patch);
      persist(name);
      return rec;
    },
    remove(id) {
      const idx = store[name].findIndex((r) => r.id === id);
      if (idx === -1) return false;
      store[name].splice(idx, 1);
      persist(name);
      return true;
    },
    count(pred) {
      return pred ? store[name].filter(pred).length : store[name].length;
    },
  };
}

// Flush on graceful shutdown so nothing is lost between the debounce window.
process.on('exit', flushSync);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

module.exports = {
  genId,
  flushSync,
  users: collection('users'),
  products: collection('products'),
  conversations: collection('conversations'),
  messages: collection('messages'),
  offers: collection('offers'),
  reviews: collection('reviews'),
  watchlist: collection('watchlist'),
  notifications: collection('notifications'),
  reports: collection('reports'),
  orders: collection('orders'),
};

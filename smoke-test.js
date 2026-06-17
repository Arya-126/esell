/* Throwaway end-to-end smoke test for the multi-currency + cart features. */
process.env.PORT = '3456';
const { server } = require('./server');
const db = require('./db');

const BASE = 'http://localhost:3456/api';
let failures = 0;

function check(name, cond, extra = '') {
  console.log(`${cond ? '✓' : '✗ FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!cond) failures++;
}

async function j(path, { method = 'GET', token, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  // 1. Currency API + locale-based detection
  const cur = await j('/currency', { headers: { 'Accept-Language': 'en-IN,en;q=0.9' } });
  check('GET /currency 200', cur.status === 200);
  check('17 currencies supported', cur.data.currencies?.length === 17, String(cur.data.currencies?.length));
  check('detects INR from Accept-Language', cur.data.detected === 'INR' && cur.data.detectedFrom === 'locale', `${cur.data.detected}/${cur.data.detectedFrom}`);
  check('geo header beats locale', (await j('/currency', { headers: { 'cf-ipcountry': 'DE', 'Accept-Language': 'en-IN' } })).data.detected === 'EUR');
  check('rates present', cur.data.rates?.INR > 1, `INR=${cur.data.rates?.INR}, source=${cur.data.source}`);

  // 2. Users: register buyer + seller (first registered becomes admin = auto-verified path varies; use seed-style direct insert for verified users)
  // Remove leftovers from any previous crashed run first.
  db.users.find((u) => /@test\.dev$/.test(u.email || '')).forEach((u) => db.users.remove(u.id));
  db.products.find((p) => /^Smoke |^Euro Item$/.test(p.title || '')).forEach((p) => db.products.remove(p.id));
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('password123', 10);
  const seller = db.users.insert({ name: 'FxSeller', email: 'fxseller@test.dev', passwordHash: hash, role: 'user', verified: true });
  const buyer = db.users.insert({ name: 'FxBuyer', email: 'fxbuyer@test.dev', passwordHash: hash, role: 'user', verified: true });
  const sLogin = await j('/auth/login', { method: 'POST', body: { email: 'fxseller@test.dev', password: 'password123' } });
  const bLogin = await j('/auth/login', { method: 'POST', body: { email: 'fxbuyer@test.dev', password: 'password123' } });
  check('seller + buyer login', !!sLogin.data.token && !!bLogin.data.token);
  const sTok = sLogin.data.token, bTok = bLogin.data.token;

  // 3. Seller lists an item in EUR -> stored in USD
  const eurRate = cur.data.rates.EUR;
  const p1 = db.products.insert({ sellerId: seller.id, title: 'Smoke Lamp', description: '', price: 50, category: 'Home', condition: 'Good', status: 'available', views: 0 });
  const p2 = db.products.insert({ sellerId: seller.id, title: 'Smoke Chair', description: '', price: 30, category: 'Furniture', condition: 'Good', status: 'available', views: 0 });

  // 4. Buyer (in INR) sets preference + carts both items
  const setCur = await j('/currency', { method: 'POST', token: bTok, body: { currency: 'INR' } });
  check('POST /currency saves preference', setCur.status === 200 && setCur.data.currency === 'INR');
  check('rejects bogus currency', (await j('/currency', { method: 'POST', body: { currency: 'XXX' } })).status === 400);

  const add1 = await j('/cart', { method: 'POST', token: bTok, body: { productId: p1.id } });
  await j('/cart', { method: 'POST', token: bTok, body: { productId: p1.id } }); // duplicate add
  const add2 = await j('/cart', { method: 'POST', token: bTok, body: { productId: p2.id } });
  check('cart add works', add1.status === 200, JSON.stringify(add1.data.items?.length));
  check('duplicate add stays 1, total 2 items', add2.data.count === 2, String(add2.data.count));
  check('own item rejected', (await j('/cart', { method: 'POST', token: sTok, body: { productId: p1.id } })).status === 400);

  // Cart totals convert (user pref cookie isn't sent via fetch; relies on user record preference)
  // Re-fetch rates: the live feed may have replaced the fallback snapshot since boot.
  const curNow = await j('/currency');
  const cartGet = await j('/cart', { token: bTok });
  const inrRate = curNow.data.rates.INR;
  check('cart total in INR', cartGet.data.currency === 'INR' && Math.abs(cartGet.data.total - 80 * inrRate) < 1, `${cartGet.data.currency} ${cartGet.data.total} vs ${80 * inrRate}`);

  // 5. Cart checkout -> group of reserved orders with locked fx
  const co = await j('/cart/checkout', { method: 'POST', token: bTok });
  check('cart checkout creates group', co.status === 200 && co.data.orders?.length === 2, JSON.stringify(co.data));
  const groupId = co.data.groupId;
  check('products reserved', db.products.byId(p1.id).status === 'reserved' && db.products.byId(p2.id).status === 'reserved');
  check('cart emptied', (await j('/cart', { token: bTok })).data.count === 0);

  const grp = await j(`/orders/group/${groupId}`, { token: bTok });
  check('GET group totals', grp.status === 200 && grp.data.totalUsd === 80 && grp.data.currency === 'INR', JSON.stringify({ t: grp.data.totalUsd, c: grp.data.currency, f: grp.data.totalFormatted }));
  check('group hidden from others', (await j(`/orders/group/${groupId}`, { token: sTok })).status === 404);

  // 6. Pay the whole group with the stub card
  const pay = await j(`/orders/group/${groupId}/pay`, {
    method: 'POST', token: bTok,
    body: { shipping: { name: 'Fx Buyer', line1: '1 Test St', city: 'Mumbai', zip: '400001', country: 'IN' }, card: { number: '4242 4242 4242 4242', exp: '12/29', cvc: '123' } },
  });
  check('group pay succeeds', pay.status === 200 && pay.data.orders?.every((o) => o.status === 'paid'), JSON.stringify(pay.data.orders?.map((o) => o.status)));
  check('orders carry locked currency', pay.data.orders?.every((o) => o.currency === 'INR' && o.fxRate > 0 && o.charged?.includes('₹')), pay.data.orders?.[0]?.charged);
  check('products sold', db.products.byId(p1.id).status === 'sold');

  // 7. Buy-now single order locks currency at creation
  const p3 = db.products.insert({ sellerId: seller.id, title: 'Smoke Book', description: '', price: 10, category: 'Books', condition: 'Good', status: 'available', views: 0 });
  const buyNow = await j('/orders', { method: 'POST', token: bTok, body: { productId: p3.id } });
  check('buy-now order has INR locked', buyNow.data.order?.currency === 'INR' && buyNow.data.order?.amountInCurrency > 0, JSON.stringify({ c: buyNow.data.order?.currency, a: buyNow.data.order?.amountInCurrency }));
  const single = await j(`/orders/${buyNow.data.order.id}/pay`, {
    method: 'POST', token: bTok,
    body: { shipping: { name: 'Fx Buyer', line1: '1 Test St', city: 'Mumbai', zip: '400001' }, card: { number: '4242 4242 4242 4242', exp: '12/29', cvc: '123' } },
  });
  check('single pay succeeds', single.status === 200 && single.data.order?.status === 'paid');

  // 8. Transaction history + receipt
  const mine = await j('/orders/mine', { token: bTok });
  check('history shows 3 purchases', mine.data.purchases?.length === 3, String(mine.data.purchases?.length));
  check('history rows have charged amounts', mine.data.purchases?.every((o) => !!o.charged));
  const receipt = await fetch(`${BASE}/orders/${buyNow.data.order.id}/receipt`, { headers: { Authorization: `Bearer ${bTok}` } });
  check('PDF receipt streams', receipt.status === 200 && (receipt.headers.get('content-type') || '').includes('pdf'));

  // 9. Listing in a foreign currency converts to USD base
  const sellRes = await fetch(`${BASE}/products`, {
    method: 'POST', headers: { Authorization: `Bearer ${sTok}` },
    body: (() => { const fd = new FormData(); fd.append('title', 'Euro Item'); fd.append('price', '92'); fd.append('currency', 'EUR'); fd.append('category', 'Other'); return fd; })(),
  });
  const sellData = await sellRes.json();
  const eurNow = (await j('/currency')).data.rates.EUR;
  check('EUR listing stored as USD', Math.abs(sellData.product?.price - 92 / eurNow) < 0.5, `stored=$${sellData.product?.price} (rate ${eurNow})`);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
  // cleanup test data
  [p1, p2, p3, { id: sellData.product?.id }].forEach((p) => p.id && db.products.remove(p.id));
  [seller, buyer].forEach((u) => db.users.remove(u.id));
  db.orders.find((o) => o.buyerId === buyer.id).forEach((o) => db.orders.remove(o.id));
  db.notifications.find((n) => [seller.id, buyer.id].includes(n.userId)).forEach((n) => db.notifications.remove(n.id));
  db.flushSync();
  server.close();
  process.exit(failures ? 1 : 0);
}

main().catch((e) => { console.error('SMOKE TEST CRASHED:', e); process.exit(1); });

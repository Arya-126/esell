/* Downloads a real, name-matching photo for each catalog product from the
   Openverse API (Creative-Commons images, no watermark overlay) into
   public/seed-assets/products/<slug>.jpg.

   Run once:  node fetch-images.js          (commit the results)
   Idempotent: already-downloaded products are skipped, so re-running only
   fills in the gaps. Products without a photo fall back to a committed
   category image at seed time. */
const fs = require('fs');
const path = require('path');
const { CATALOG, slugify, imageQuery } = require('./seed-catalog');

const OUT = path.join(__dirname, 'public', 'seed-assets', 'products');
fs.mkdirSync(OUT, { recursive: true });

const UA = { 'User-Agent': 'ReWear-Seed/1.0 (demo data)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Flatten catalog: [{ title, query }]
const items = [];
for (const { items: rows } of Object.values(CATALOG)) {
  for (const [title, , , , query] of rows) items.push({ title, query: query || imageQuery(title) });
}

async function searchOpenverse(q) {
  const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=8&mature=false`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 429) throw new Error('rate-limited');
  if (!res.ok) throw new Error('search ' + res.status);
  const data = await res.json();
  return (data.results || []).map((r) => r.url).filter(Boolean);
}

async function download(url, dest) {
  const res = await fetch(url, { headers: UA, redirect: 'follow' });
  if (!res.ok) throw new Error('img ' + res.status);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 3000) throw new Error('too small'); // likely an error page
  // Must be a real JPEG (FF D8 FF) — reject SVG/PNG/HTML masquerading as .jpg.
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error('not a jpeg');
  fs.writeFileSync(dest, buf);
}

(async () => {
  let ok = 0, skip = 0, fail = 0;
  const failed = [];
  for (const { title, query } of items) {
    const slug = slugify(title);
    const dest = path.join(OUT, `${slug}.jpg`);
    if (fs.existsSync(dest)) { skip++; continue; }
    try {
      const urls = await searchOpenverse(query);
      let saved = false;
      for (const u of urls) {
        try { await download(u, dest); saved = true; break; } catch { /* try next url */ }
      }
      if (saved) { ok++; process.stdout.write(`  ✓ ${slug}  «${query}»\n`); }
      else { fail++; failed.push(title); process.stdout.write(`  ✗ ${slug}  (no usable image for «${query}»)\n`); }
    } catch (e) {
      fail++; failed.push(title);
      process.stdout.write(`  ✗ ${slug}  (${e.message})\n`);
      if (e.message === 'rate-limited') await sleep(4000);
    }
    await sleep(350); // be polite to the API
  }
  console.log(`\nDone. ${ok} downloaded, ${skip} skipped (already had), ${fail} failed.`);
  if (failed.length) console.log('Re-run to retry: ' + failed.length + ' remaining.');
})();

/* Shared demo catalog: sellers + products, plus helpers used by both seed.js
   and fetch-images.js so they agree on per-product image filenames. */

// [name, emailLocal, city, bio]
const SELLER_DEFS = [
  ['Maya Chen', 'maya', 'Brooklyn, NY', 'Decluttering my apartment. Everything priced to go!'],
  ['Leo Park', 'leo', 'Queens, NY', 'Vintage tech & guitars.'],
  ['Sara Idris', 'sara', 'Jersey City, NJ', 'Slow fashion over fast fashion.'],
  ['Tom Becker', 'tom', 'Chicago, IL', 'Woodworker offloading studio gear.'],
  ['Priya Nair', 'priya', 'Austin, TX', 'Books, books, and more books.'],
  ['Diego Morales', 'diego', 'San Diego, CA', 'Surf, skate, sell, repeat.'],
  ['Hannah Schmidt', 'hannah', 'Seattle, WA', 'Minimalist always rotating my closet.'],
  ['Marcus Johnson', 'marcus', 'Atlanta, GA', 'Home gym upgrades = great deals for you.'],
  ['Yuki Tanaka', 'yuki', 'San Jose, CA', 'Gadget collector making room.'],
  ['Elena Petrova', 'elena', 'Boston, MA', 'Antiques and oddities.'],
  ['Omar Haddad', 'omar', 'Detroit, MI', 'Fixing up and flipping furniture.'],
  ['Grace Liu', 'grace', 'Portland, OR', 'Plant parent and homebody.'],
  ['Noah Williams', 'noah', 'Denver, CO', 'Mountains every weekend — gear rotates fast.'],
  ['Fatima Khan', 'fatima', 'Houston, TX', 'Kids grow up so fast!'],
  ['Liam O\'Brien', 'liam', 'Philadelphia, PA', 'Record digger and film shooter.'],
  ['Sofia Rossi', 'sofia', 'Miami, FL', 'Design lover downsizing.'],
  ['Daniel Kim', 'daniel', 'Los Angeles, CA', 'Producer selling studio extras.'],
  ['Aisha Bello', 'aisha', 'Minneapolis, MN', 'Thrift queen passing it on.'],
  ['Ethan Clark', 'ethan', 'Nashville, TN', 'Musician, perpetual gear churn.'],
  ['Nadia Ahmadi', 'nadia', 'Sacramento, CA', 'Cozy home, honest prices.'],
  ['Carlos Mendez', 'carlos', 'Phoenix, AZ', 'Tools and toys.'],
  ['Zoe Bennett', 'zoe', 'Pittsburgh, PA', 'Crafter clearing the craft room.'],
];

// Per category: `images` are committed local fallbacks (used if a per-product
// photo wasn't fetched); `items` are [title, description, price, condition].
// `query` (optional 5th field) overrides the image-search term for that product.
const CATALOG = {
  Electronics: {
    images: ['/seed-assets/headphones.jpg', '/seed-assets/keyboard.png', '/seed-assets/kindle.png', '/seed-assets/cand-kindle.jpg'],
    items: [
      ['Sony WH-1000XM3 headphones', 'Excellent noise cancelling. Comes with case and cable.', 95, 'Good'],
      ['Apple AirPods Pro (1st gen)', 'New silicone tips fitted. Battery health solid.', 70, 'Good'],
      ['Kindle Paperwhite (10th gen)', 'Backlit, waterproof. Battery still lasts weeks.', 55, 'Like New'],
      ['Logitech MX Master 3 mouse', 'Best productivity mouse there is. USB-C charging.', 45, 'Good'],
      ['Mechanical keyboard (brown switches)', 'Tactile and quiet-ish. USB-C, no software needed.', 48, 'Good', 'mechanical keyboard'],
      ['Anker 20000mAh power bank', 'Charges a phone 4-5 times. Two USB ports.', 22, 'Like New', 'power bank'],
      ['Nintendo Switch (2019 model)', 'Includes dock, two Joy-Cons and a case. Resealed.', 165, 'Good', 'nintendo switch'],
      ['GoPro HERO7 Black', 'Waterproof action cam with two batteries and mounts.', 110, 'Good', 'gopro action camera'],
      ['iPad Air 2 (64GB, WiFi)', 'Great for reading and streaming. Some back wear.', 90, 'Fair', 'ipad tablet'],
      ['Samsung 24-inch 1080p monitor', 'Crisp IPS panel, HDMI + VGA. No dead pixels.', 65, 'Good', 'computer monitor'],
      ['Bose SoundLink Mini II', 'Punchy little Bluetooth speaker with charging cradle.', 60, 'Good', 'bluetooth speaker'],
      ['Raspberry Pi 4 (4GB) starter kit', 'Case, PSU, heatsinks and a 32GB card included.', 55, 'Like New', 'raspberry pi'],
      ['Canon EOS Rebel T6 DSLR', 'With 18-55mm kit lens, strap and charger.', 180, 'Good', 'dslr camera'],
      ['Fitbit Charge 4', 'Tracks steps, sleep and heart rate. Fresh band.', 35, 'Good', 'fitness tracker'],
    ],
  },
  Clothing: {
    images: ['/seed-assets/fleece-jacket.png', '/seed-assets/cand-fleece-jacket.jpg'],
    items: [
      ['Patagonia fleece jacket (M)', 'Cozy and barely worn. Smoke-free home.', 40, 'Like New', 'fleece jacket'],
      ["Levi's 501 jeans (32x32)", 'Classic straight fit, broken in just right.', 28, 'Good', 'blue jeans'],
      ['Dr. Martens 1460 boots (UK8)', 'Resoled once, lots of life left. Black smooth.', 60, 'Good', 'leather boots'],
      ['Wool peacoat (L)', 'Warm navy peacoat, all buttons intact.', 48, 'Good', 'wool coat'],
      ['Vintage denim jacket (M)', 'Perfectly faded 90s trucker jacket.', 38, 'Good', 'denim jacket'],
      ['Nike Pegasus running shoes (US10)', 'Maybe 50 miles on them. Cleaned up nicely.', 42, 'Good', 'running shoes'],
      ['Cashmere crewneck sweater (S)', 'Soft grey, no pills or holes.', 35, 'Like New', 'sweater'],
      ['Brown leather belt', 'Full-grain leather, fits 32-36.', 14, 'Good', 'leather belt'],
      ["Women's rain shell (M)", 'Packable, fully waterproof, taped seams.', 30, 'Good', 'rain jacket'],
      ['Linen summer dress (M)', 'Breezy and unworn, tags off only.', 26, 'Like New', 'summer dress'],
      ['Flannel shirt (L)', 'Heavyweight buffalo plaid. Super soft.', 16, 'Good', 'flannel shirt'],
      ['Chino trousers (34x32)', 'Khaki, slim-straight. Hardly worn.', 18, 'Like New', 'chino trousers'],
      ['Chunky knit beanie', 'Hand-knit wool, one size.', 10, 'New', 'knit beanie hat'],
      ['Silk patterned scarf', 'Large square scarf, gift-quality.', 20, 'Like New', 'silk scarf'],
    ],
  },
  Furniture: {
    images: ['/seed-assets/coffee-table.png', '/seed-assets/cand-coffee-table.jpg'],
    items: [
      ['Mid-century walnut coffee table', 'Solid walnut, a few light scratches but very sturdy.', 120, 'Good', 'coffee table'],
      ['IKEA Billy bookcase (white)', 'Disassembled with all hardware. Pickup only.', 30, 'Good', 'bookcase'],
      ['Oak dining chairs (set of 4)', 'Solid and wobble-free. Minor wear on seats.', 90, 'Good', 'dining chairs'],
      ['Velvet accent armchair', 'Deep teal, comfy and clean. Statement piece.', 140, 'Good', 'armchair'],
      ['Bedside nightstand', 'One drawer, one shelf. Fits any room.', 25, 'Good', 'nightstand'],
      ['Electric standing desk', 'Dual-motor, memory presets. Smooth and quiet.', 220, 'Like New', 'standing desk'],
      ['Bar stools (pair)', 'Adjustable height, faux leather seats.', 55, 'Good', 'bar stool'],
      ['Rattan plant stand', 'Holds three pots. Boho vibe.', 18, 'Good', 'plant stand'],
      ['Pine bookshelf (5 tier)', 'Tall and deep. Some shelf bowing under heavy books.', 35, 'Fair', 'bookshelf'],
      ['Folding card table', 'Great for game night, stores flat.', 15, 'Good', 'folding table'],
      ['Storage ottoman bench', 'Lift-top with tons of storage. Linen grey.', 45, 'Like New', 'ottoman bench'],
      ['Ergonomic office chair', 'Mesh back, lumbar support, all tilts work.', 70, 'Good', 'office chair'],
      ['Narrow console table', 'Entryway table with a lower shelf.', 50, 'Good', 'console table'],
      ['Full-length floor mirror', 'Thin black frame, leans or mounts.', 40, 'Like New', 'floor mirror'],
    ],
  },
  Books: {
    images: ['/seed-assets/books.png', '/seed-assets/try-k1.jpg'],
    items: [
      ['Box of sci-fi paperbacks (12)', 'Asimov, Le Guin, Herbert and more. Take the lot.', 18, 'Good', 'paperback books'],
      ['Harry Potter complete set', 'All 7 paperbacks, spines intact.', 35, 'Good', 'book series'],
      ['The Lord of the Rings trilogy', 'Boxed paperback set, lightly read.', 22, 'Good', 'book trilogy'],
      ['Cookbook bundle (5 titles)', 'Italian, baking, vegetarian and two more.', 24, 'Good', 'cookbooks'],
      ["O'Reilly programming books (6)", 'Python, JS and algorithms. A few highlights inside.', 30, 'Fair', 'programming books'],
      ["Children's picture books (lot of 20)", 'Bedtime favourites, gently loved.', 20, 'Good', 'childrens books'],
      ['Graphic novel collection', 'Saga, Sandman and more. Eight volumes.', 45, 'Like New', 'graphic novels'],
      ['Penguin Classics set', 'Ten clothbound-style classics.', 40, 'Like New', 'classic books'],
      ['Art history textbooks', 'University editions, minimal marks.', 28, 'Good', 'textbooks'],
      ['Field guide bundle (birds & plants)', 'Pocket-sized, perfect for hikes.', 14, 'Good', 'field guide book'],
      ['Vintage National Geographic (20 issues)', 'From the 80s, great covers.', 16, 'Fair', 'magazines'],
      ['Self-improvement bundle', 'Five popular titles, like new.', 18, 'Like New', 'stack of books'],
      ['Manga volumes 1-10', 'Complete first arc, no creases.', 32, 'Good', 'manga books'],
      ['Modern poetry anthology', 'Hardcover, gift condition.', 12, 'Like New', 'poetry book'],
    ],
  },
  Toys: {
    images: ['/seed-assets/train.png', '/seed-assets/try-t1.jpg', '/seed-assets/try-t2.jpg'],
    items: [
      ['Wooden train set', 'Kids outgrew it. Tracks plus 6 carriages.', 22, 'Good', 'wooden train toy'],
      ['LEGO Technic crane', 'Complete build with instructions and box.', 60, 'Good', 'lego bricks'],
      ['Nerf blaster bundle', 'Three blasters and a tub of darts.', 25, 'Good', 'nerf gun toy'],
      ['Vintage tin robots (set of 3)', 'Wind-up collectibles, display only.', 48, 'Fair', 'tin robot toy'],
      ['Board game night bundle', 'Catan, Ticket to Ride and Codenames.', 40, 'Good', 'board games'],
      ['Rubik\'s cube collection', '2x2 through 5x5, all turning smoothly.', 18, 'Good', 'rubiks cube'],
      ['RC rock crawler', 'Remote, battery and charger included.', 35, 'Good', 'remote control car'],
      ['Wooden dollhouse with furniture', 'Three floors, lots of little pieces.', 50, 'Good', 'dollhouse'],
      ['Jigsaw puzzles (3 x 1000pc)', 'All pieces counted and present.', 15, 'Good', 'jigsaw puzzle'],
      ['Action figure lot (12)', 'Mixed superheroes, some loose joints.', 30, 'Fair', 'action figures'],
      ['Toy play kitchen', 'Pretend stove, sink and accessories.', 45, 'Good', 'toy kitchen'],
      ['Building blocks bin (5kg)', 'Compatible bricks, washed and sorted.', 28, 'Good', 'building blocks toy'],
      ['Dinosaur figure set', 'A dozen detailed dinos for imaginative play.', 12, 'Like New', 'toy dinosaurs'],
      ['Delta kite', 'Easy-flying, comes with line and winder.', 10, 'New', 'kite'],
    ],
  },
  Sports: {
    images: ['/seed-assets/yoga-mat.jpg', '/seed-assets/cand-yoga-mat.jpg'],
    items: [
      ['Yoga mat + blocks', 'Lightly used, cleaned and rolled.', 15, 'Good', 'yoga mat'],
      ['Adjustable dumbbells (pair)', '5-25 lb each, dial system. No rust.', 120, 'Good', 'dumbbells'],
      ['Trek hybrid bike (M)', 'Recently tuned, new brake pads. Rides great.', 240, 'Good', 'bicycle'],
      ['Tennis racket + balls', 'Mid-size head, fresh overgrip.', 28, 'Good', 'tennis racket'],
      ['Camping tent (2-person)', 'Quick pitch, no leaks, stuff sack included.', 45, 'Good', 'camping tent'],
      ['Hiking backpack 40L', 'Rain cover and hydration sleeve.', 38, 'Good', 'hiking backpack'],
      ['Complete skateboard', 'Maple deck, smooth bearings.', 30, 'Good', 'skateboard'],
      ['Soccer ball + cones', 'Size 5 ball and ten training cones.', 18, 'Good', 'soccer ball'],
      ['Resistance bands set', 'Five strengths with handles and door anchor.', 14, 'Like New', 'resistance bands'],
      ['Foam roller', 'High-density, great for recovery.', 12, 'Good', 'foam roller'],
      ['Climbing shoes (US9)', 'Resoled, aggressive fit. Lots of grip left.', 40, 'Good', 'climbing shoes'],
      ['Snowboard (155cm)', 'All-mountain board, bindings included.', 130, 'Good', 'snowboard'],
      ['Kettlebell 16kg', 'Cast iron, powder coat intact.', 32, 'Good', 'kettlebell'],
      ['Speed jump rope', 'Adjustable cable, ball bearings.', 8, 'New', 'jump rope'],
    ],
  },
  Home: {
    images: ['/seed-assets/desk-lamp.png', '/seed-assets/try-l1.jpg'],
    items: [
      ['IKEA desk lamp', 'Works perfectly, warm LED bulb included.', 12, 'Like New', 'desk lamp'],
      ['Ceramic dinnerware set (4)', 'Plates, bowls and mugs. No chips.', 30, 'Good', 'dinnerware set'],
      ['Cast iron skillet (12-inch)', 'Seasoned and ready to cook.', 22, 'Good', 'cast iron skillet'],
      ['Pendant ceiling lamp', 'Industrial dome shade, rewired safely.', 35, 'Good', 'pendant lamp'],
      ['Throw pillows (set of 4)', 'Neutral covers, inserts included.', 18, 'Like New', 'throw pillows'],
      ['French press + burr grinder', 'Make proper coffee at home.', 28, 'Good', 'french press coffee'],
      ['Mid-century wall clock', 'Silent sweep movement, fresh battery.', 16, 'Good', 'wall clock'],
      ['Area rug (5x7)', 'Low pile, recently cleaned. Geometric pattern.', 55, 'Good', 'area rug'],
      ['HEPA air purifier', 'Covers a bedroom. New filter installed.', 60, 'Good', 'air purifier home'],
      ['Espresso machine', 'Pump machine with steam wand. Descaled.', 85, 'Good', 'espresso machine'],
      ['Houseplant pots (set of 6)', 'Terracotta with drainage trays.', 20, 'Good', 'plant pots'],
      ['Queen bedding set', 'Duvet cover and two shams. Washed.', 24, 'Good', 'bedding set'],
      ['Toaster oven', 'Bakes and broils evenly. Crumb tray included.', 26, 'Good', 'toaster oven'],
      ['Scented candle bundle', 'Three soy candles, barely burned.', 14, 'Like New', 'scented candles'],
    ],
  },
  Other: {
    images: ['/seed-assets/guitar.png', '/seed-assets/cand-guitar.jpg'],
    items: [
      ['Fender Squier Stratocaster', 'Great starter electric guitar. Fresh strings.', 160, 'Good', 'electric guitar'],
      ['Acoustic dreadnought guitar', 'Warm tone, plays in tune up the neck.', 110, 'Good', 'acoustic guitar'],
      ['Vinyl record lot (30)', 'Rock and soul classics. Sleeves a bit worn.', 75, 'Good', 'vinyl records'],
      ['35mm film camera', 'Fully mechanical SLR with 50mm lens.', 85, 'Good', 'film camera'],
      ['Sewing machine', 'Mechanical, all stitches tested. Pedal included.', 55, 'Good', 'sewing machine'],
      ['Bicycle repair stand', 'Clamp adjusts to any frame. Folds away.', 40, 'Good', 'bicycle repair stand'],
      ['Art supplies kit', 'Acrylics, brushes and a pad. Barely touched.', 30, 'Like New', 'art supplies'],
      ['Beginner telescope', 'Refractor with tripod and two eyepieces.', 65, 'Good', 'telescope'],
      ['Concert ukulele', 'Mahogany, with gig bag and tuner.', 38, 'Like New', 'ukulele'],
      ['Vintage typewriter', 'Working manual typewriter, fresh ribbon.', 70, 'Fair', 'vintage typewriter'],
      ['Tool set (120-piece)', 'Sockets, bits and pliers in a case.', 45, 'Good', 'tool set'],
      ['Picture frame bundle', 'Mixed sizes, gallery-wall ready.', 16, 'Good', 'picture frames'],
      ['Yamaha keyboard piano (61 keys)', 'Touch-sensitive with stand and adapter.', 90, 'Good', 'keyboard piano'],
      ['Mini camera drone', 'Beginner-friendly, two batteries, prop guards.', 50, 'Good', 'camera drone'],
    ],
  },
};

// Stable filename slug from a product title (both scripts must agree).
const slugify = (t) =>
  t.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// Image-search term for a title: drop parentheticals and any token with a digit
// (model numbers, sizes), keeping brand + nouns.
const imageQuery = (title) =>
  title
    .replace(/\(.*?\)/g, ' ')
    .replace(/[+/&]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !/\d/.test(w))
    .join(' ')
    .trim();

module.exports = { SELLER_DEFS, CATALOG, slugify, imageQuery };

/**
 * Thumbnail generation using Jimp (pure JS — no native deps).
 * Produces a downscaled copy next to the original so grids load fast,
 * while product pages keep the full-resolution image.
 */
const path = require('path');

let Jimp = null;
try {
  Jimp = require('jimp');
} catch {
  Jimp = null; // graceful: app still works, just serves the original image
}

const THUMB_WIDTH = 600;

// Returns the public path to the thumbnail, or null if generation failed.
async function makeThumbnail(absSourcePath, filename, uploadDir) {
  if (!Jimp) return null;
  try {
    const img = await Jimp.read(absSourcePath);
    if (img.bitmap.width > THUMB_WIDTH) {
      img.resize(THUMB_WIDTH, Jimp.AUTO);
    }
    img.quality(72); // applies to JPEG output
    const thumbName = `thumb-${filename}`;
    await img.writeAsync(path.join(uploadDir, thumbName));
    return `/uploads/${thumbName}`;
  } catch (e) {
    console.error('[THUMB] generation failed:', e.message);
    return null;
  }
}

// Category palette for generated placeholder imagery.
const CATEGORY_COLORS = {
  Electronics: 0x3b82f6ff,
  Clothing: 0xec4899ff,
  Furniture: 0xd97706ff,
  Books: 0x14b8a6ff,
  Toys: 0xf59e0bff,
  Sports: 0x22c55eff,
  Home: 0x06b6d4ff,
  Other: 0x64748bff,
};

let _fontCache = {};
async function font(name) {
  if (!_fontCache[name]) _fontCache[name] = await Jimp.loadFont(name);
  return _fontCache[name];
}

// Generates a clean coloured card image with the item title + category.
// Returns true on success. Used by the seeder so the demo has real images.
async function generatePlaceholder(title, category, absOutPath) {
  if (!Jimp) return false;
  try {
    const W = 800, H = 600;
    const bg = CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
    const img = new Jimp(W, H, bg);

    // Subtle darker band along the bottom for the category label.
    const band = new Jimp(W, 90, 0x00000033);
    img.composite(band, 0, H - 90);

    const big = await font(Jimp.FONT_SANS_64_WHITE);
    const small = await font(Jimp.FONT_SANS_32_WHITE);
    img.print(big, 50, 40, { text: title, alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER, alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE }, W - 100, H - 180);
    img.print(small, 50, H - 78, { text: category.toUpperCase(), alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT }, W - 100, 50);

    await img.writeAsync(absOutPath);
    return true;
  } catch (e) {
    console.error('[IMG] placeholder failed:', e.message);
    return false;
  }
}

module.exports = { makeThumbnail, generatePlaceholder, available: !!Jimp };

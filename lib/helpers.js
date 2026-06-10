/** Shared domain helpers: eco impact, trust scores, fair-price logic. */
const db = require('../db');

// Rough CO2-equivalent (kg) saved by buying an item second-hand instead of new.
// Numbers are illustrative industry-style estimates, keyed by category.
const ECO_BY_CATEGORY = {
  Electronics: 55,
  Clothing: 25,
  Furniture: 90,
  Books: 5,
  Toys: 8,
  Sports: 20,
  Home: 30,
  Other: 15,
};

function ecoSavedFor(category) {
  return ECO_BY_CATEGORY[category] ?? ECO_BY_CATEGORY.Other;
}

// Trust score (0-100) from a seller's reviews + completed sales + account standing.
function trustScoreFor(userId) {
  const reviews = db.reviews.find((r) => r.sellerId === userId);
  const sold = db.products.count((p) => p.sellerId === userId && p.status === 'sold');
  if (reviews.length === 0 && sold === 0) return null; // "New seller"
  const avg = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 4; // neutral baseline if sales but no reviews yet
  const ratingComponent = (avg / 5) * 80; // up to 80 pts from ratings
  const volumeComponent = Math.min(20, sold * 4); // up to 20 pts from sales volume
  return Math.round(ratingComponent + volumeComponent);
}

// Compare a price against the average for its category.
// Returns { label, ratio } where label ∈ Great deal | Fair price | Above average.
function fairPrice(category, price) {
  const peers = db.products.find(
    (p) => p.category === category && p.status === 'available'
  );
  if (peers.length < 3) return { label: 'No data', ratio: 1 };
  const avg = peers.reduce((s, p) => s + p.price, 0) / peers.length;
  const ratio = price / avg;
  let label = 'Fair price';
  if (ratio <= 0.8) label = 'Great deal';
  else if (ratio >= 1.2) label = 'Above average';
  return { label, ratio: Number(ratio.toFixed(2)), avg: Math.round(avg) };
}

// Public-safe user projection (never leak password hashes).
function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    bio: u.bio || '',
    createdAt: u.createdAt,
    banned: !!u.banned,
    verified: !!u.verified,
    trustScore: trustScoreFor(u.id),
    ecoImpact: userEcoImpact(u.id),
  };
}

// Total CO2 a user has saved as a buyer (sum of items they've bought).
function userEcoImpact(userId) {
  const bought = db.products.find((p) => p.buyerId === userId && p.status === 'sold');
  return bought.reduce((s, p) => s + ecoSavedFor(p.category), 0);
}

function notify(userId, type, text, link) {
  return db.notifications.insert({ userId, type, text, link, read: false });
}

module.exports = {
  ECO_BY_CATEGORY,
  ecoSavedFor,
  trustScoreFor,
  fairPrice,
  publicUser,
  userEcoImpact,
  notify,
};

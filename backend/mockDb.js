const crypto = require("crypto");
const sampleTravelData = require("./init/data");
const samplePackageData = require("./data/packageData");

// MOCKED — in-memory fallback store when MongoDB is unavailable
const travels = sampleTravelData.map((item, idx) => ({
  _id: `travel-${idx + 1}`,
  ...item,
  highlights: Array.isArray(item.highlights) ? item.highlights : [],
  amenities: Array.isArray(item.amenities) ? item.amenities : [],
  createdAt: item.createdAt || new Date().toISOString(),
}));

const packages = samplePackageData.map((item, idx) => ({
  _id: `package-${idx + 1}`,
  ...item,
  highlights: Array.isArray(item.highlights) ? item.highlights : [],
  amenities: Array.isArray(item.amenities) ? item.amenities : [],
}));

const users = [];
const favorites = [];
const bookings = [];

const createId = (prefix) => `${prefix}-${crypto.randomBytes(8).toString("hex")}`;

module.exports = {
  travels,
  packages,
  users,
  favorites,
  bookings,
  createId,
};

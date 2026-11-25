const ApiError = require("../utils/ApiError");
const { sanitizeString, isSafeHttpUrl } = require("../utils/sanitize");

const ALLOWED_CATEGORIES = [
  "Beach",
  "Mountain",
  "Historical",
  "Adventure",
  "City",
  "Nature",
  "Spiritual",
  "Cultural",
];

function sanitizeStringList(val, maxItems = 15, maxLen = 120) {
  if (Array.isArray(val)) {
    return val
      .map((item) => sanitizeString(item, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  if (typeof val === "string") {
    return val
      .split(",")
      .map((s) => sanitizeString(s, maxLen))
      .filter(Boolean)
      .slice(0, maxItems);
  }
  return [];
}

function validateTravelPayload(req, { partial = false } = {}) {
  const b = req.body || {};
  const data = {};

  if (!partial || b.title !== undefined) {
    const title = sanitizeString(b.title, 140);
    if (title.length < 3) throw new ApiError(400, "Title must be at least 3 characters.");
    data.title = title;
  }

  if (!partial || b.description !== undefined) {
    const description = sanitizeString(b.description, 2000);
    if (description.length < 10) {
      throw new ApiError(400, "Description must be at least 10 characters.");
    }
    data.description = description;
  }

  if (!partial || b.country !== undefined) {
    const country = sanitizeString(b.country, 80);
    if (!country) throw new ApiError(400, "Country is required.");
    data.country = country;
  }

  if (b.state !== undefined) {
    data.state = sanitizeString(b.state, 80);
  }

  if (!partial || b.city !== undefined) {
    const city = sanitizeString(b.city, 80);
    if (!city) throw new ApiError(400, "City is required.");
    data.city = city;
  }

  if (b.location !== undefined) {
    data.location = sanitizeString(b.location, 140);
  }

  if (!partial || b.pricePerNight !== undefined) {
    const price = Number(b.pricePerNight);
    if (!Number.isFinite(price) || price < 1 || price > 100000) {
      throw new ApiError(400, "pricePerNight must be a valid positive number.");
    }
    data.pricePerNight = Math.round(price * 100) / 100;
  }

  if (!partial || b.category !== undefined) {
    const category = sanitizeString(b.category, 40);
    if (!ALLOWED_CATEGORIES.includes(category)) {
      throw new ApiError(
        400,
        `Category must be one of: ${ALLOWED_CATEGORIES.join(", ")}.`,
      );
    }
    data.category = category;
  }

  if (b.rating !== undefined) {
    const rating = Number(b.rating);
    if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
      throw new ApiError(400, "Rating must be between 0 and 5.");
    }
    data.rating = Math.round(rating * 10) / 10;
  }

  if (!partial || b.image !== undefined || b.imageUrl !== undefined) {
    const imageUrl = sanitizeString(
      typeof b.image === "string" ? b.image : b.image?.url || b.imageUrl,
      500,
    );
    if (!isSafeHttpUrl(imageUrl)) {
      throw new ApiError(400, "A valid http(s) cover image URL is required.");
    }
    data.image = { url: imageUrl, filename: sanitizeString(b.image?.filename || "", 120) };
  }

  if (b.coordinates !== undefined || b.latitude !== undefined || b.longitude !== undefined) {
    const lat = Number(b.coordinates?.latitude ?? b.latitude);
    const lng = Number(b.coordinates?.longitude ?? b.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new ApiError(400, "Coordinates out of valid latitude/longitude bounds.");
      }
      data.coordinates = { latitude: lat, longitude: lng };
    }
  }

  if (b.bestTimeToVisit !== undefined) {
    data.bestTimeToVisit = sanitizeString(b.bestTimeToVisit, 120);
  }
  if (b.estimatedDuration !== undefined) {
    data.estimatedDuration = sanitizeString(b.estimatedDuration, 60);
  }
  if (b.approximateBudget !== undefined) {
    data.approximateBudget = sanitizeString(b.approximateBudget, 120);
  }
  if (b.highlights !== undefined) {
    data.highlights = sanitizeStringList(b.highlights);
  }
  if (b.amenities !== undefined) {
    data.amenities = sanitizeStringList(b.amenities);
  }
  if (b.activities !== undefined) {
    data.activities = sanitizeStringList(b.activities);
  }
  if (b.travelTips !== undefined) {
    data.travelTips = sanitizeStringList(b.travelTips, 10, 240);
  }
  if (b.featured !== undefined) {
    data.featured = Boolean(b.featured);
  }
  if (b.isAvailable !== undefined) {
    data.isAvailable = Boolean(b.isAvailable);
  }
  if (b.maxCapacity !== undefined) {
    const cap = Number(b.maxCapacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 500) {
      throw new ApiError(400, "maxCapacity must be an integer between 1 and 500.");
    }
    data.maxCapacity = cap;
  }

  if (partial && Object.keys(data).length === 0) {
    throw new ApiError(400, "No valid destination fields provided for update.");
  }

  return data;
}

module.exports = {
  ALLOWED_CATEGORIES,
  validateTravelCreate: (req) => validateTravelPayload(req, { partial: false }),
  validateTravelUpdate: (req) => validateTravelPayload(req, { partial: true }),
};

const mongoose = require("mongoose");

function sanitizeObject(value) {
  if (Array.isArray(value)) {
    return value.map(sanitizeObject);
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      // Strip MongoDB operator keys to prevent NoSQL injection
      if (key.startsWith("$") || key.includes(".")) {
        continue;
      }
      clean[key] = sanitizeObject(val);
    }
    return clean;
  }
  return value;
}

function sanitizeString(value, maxLen = 500) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLen);
}

function isSafeHttpUrl(url) {
  if (typeof url !== "string" || !url.trim()) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function isValidObjectId(id) {
  return typeof id === "string" && mongoose.Types.ObjectId.isValid(id) && /^[a-fA-F0-9]{24}$/.test(id);
}

function isValidEntityId(id, dbConnected) {
  if (typeof id !== "string" || !id.trim() || id.length > 120) return false;
  if (dbConnected) {
    return isValidObjectId(id);
  }
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = {
  sanitizeObject,
  sanitizeString,
  isSafeHttpUrl,
  isValidObjectId,
  isValidEntityId,
  escapeRegex,
  slugify,
};

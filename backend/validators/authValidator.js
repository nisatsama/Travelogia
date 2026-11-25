const ApiError = require("../utils/ApiError");
const { sanitizeString } = require("../utils/sanitize");

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateSignup(req) {
  const username = sanitizeString(req.body?.username, 60);
  const email = sanitizeString(req.body?.email, 160).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (username.length < 2) {
    throw new ApiError(400, "Username must be at least 2 characters long.");
  }
  if (!EMAIL_REGEX.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }
  if (password.length < 8 || password.length > 128) {
    throw new ApiError(400, "Password must be between 8 and 128 characters.");
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    throw new ApiError(400, "Password must include at least one letter and one number.");
  }

  // SECURITY: Never accept or forward role from public signup requests
  return { username, email, password };
}

function validateLogin(req) {
  const email = sanitizeString(req.body?.email, 160).toLowerCase();
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  const role = req.body?.role ? sanitizeString(req.body.role, 20).toLowerCase() : undefined;

  if (!EMAIL_REGEX.test(email)) {
    throw new ApiError(400, "Please enter a valid email address.");
  }
  if (!password) {
    throw new ApiError(400, "Password is required.");
  }
  if (role && !["user", "admin"].includes(role)) {
    throw new ApiError(400, "Invalid role selection.");
  }

  return { email, password, role };
}

function validateProfileUpdate(req) {
  const updates = {};

  if (req.body?.username !== undefined) {
    const username = sanitizeString(req.body.username, 60);
    if (username.length < 2) {
      throw new ApiError(400, "Username must be at least 2 characters long.");
    }
    updates.username = username;
  }

  if (req.body?.bio !== undefined) {
    updates.bio = sanitizeString(req.body.bio, 300);
  }

  if (req.body?.phone !== undefined) {
    const phone = sanitizeString(req.body.phone, 30);
    if (phone && !/^[+\d\s()-]{6,25}$/.test(phone)) {
      throw new ApiError(400, "Please provide a valid phone number.");
    }
    updates.phone = phone;
  }

  if (req.body?.location !== undefined) {
    updates.location = sanitizeString(req.body.location, 100);
  }

  if (Object.keys(updates).length === 0) {
    throw new ApiError(400, "No valid profile fields provided for update.");
  }

  return updates;
}

module.exports = {
  validateSignup,
  validateLogin,
  validateProfileUpdate,
};

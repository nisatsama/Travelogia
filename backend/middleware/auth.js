const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");

function extractToken(req) {
  const authHeader = req.header("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token && token !== "null" && token !== "undefined") {
      return { token, source: "bearer" };
    }
  }
  if (req.cookies && req.cookies[env.COOKIE_NAME]) {
    return { token: req.cookies[env.COOKIE_NAME], source: "cookie" };
  }
  return { token: null, source: null };
}

async function auth(req, res, next) {
  try {
    const { token, source } = extractToken(req);
    if (!token) {
      return next(new ApiError(401, "Authentication required. Please sign in."));
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET, {
        algorithms: ["HS256"],
      });
    } catch (err) {
      if (err.name === "TokenExpiredError") {
        return next(new ApiError(401, "Your session has expired. Please sign in again."));
      }
      return next(new ApiError(401, "Invalid authentication token."));
    }

    if (!decoded || !decoded.id || !decoded.role) {
      return next(new ApiError(401, "Malformed authentication token claims."));
    }

    // Verify user still exists and enforce current backend role (never blindly trust stale token role)
    const user = await store.findUserById(decoded.id);
    if (!user) {
      return next(new ApiError(401, "Account no longer exists. Please sign in again."));
    }

    req.user = {
      id: String(user._id),
      role: user.role,
      email: user.email,
      username: user.username,
    };
    req.authSource = source;
    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = auth;

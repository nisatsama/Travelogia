const jwt = require("jsonwebtoken");
const env = require("../config/env");
const store = require("../services/storeService");

async function optionalAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.header("Authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const candidate = authHeader.slice(7).trim();
      if (candidate && candidate !== "null" && candidate !== "undefined") {
        token = candidate;
      }
    } else if (req.cookies && req.cookies[env.COOKIE_NAME]) {
      token = req.cookies[env.COOKIE_NAME];
    }

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ["HS256"] });
    if (decoded && decoded.id) {
      const user = await store.findUserById(decoded.id);
      if (user) {
        req.user = {
          id: String(user._id),
          role: user.role,
          email: user.email,
          username: user.username,
        };
      }
    }
  } catch {
    req.user = null;
  }
  return next();
}

module.exports = optionalAuth;

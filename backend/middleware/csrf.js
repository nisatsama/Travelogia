const env = require("../config/env");
const ApiError = require("../utils/ApiError");

// CSRF protection for state-changing cookie-authenticated requests
function csrfProtect(req, res, next) {
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  if (safeMethods.has(req.method)) {
    return next();
  }

  // Only enforce CSRF check when auth is carried via cookie (not Bearer token)
  const hasAuthCookie = Boolean(req.cookies && req.cookies[env.COOKIE_NAME]);
  const hasBearer = Boolean(
    req.header("Authorization") && req.header("Authorization").startsWith("Bearer "),
  );
  if (!hasAuthCookie || hasBearer) {
    return next();
  }

  // Require either matching Origin/Host OR explicit X-Requested-With custom header
  const xRequestedWith = req.header("X-Requested-With");
  if (xRequestedWith === "XMLHttpRequest") {
    return next();
  }

  const origin = req.header("Origin");
  const expectedHost = req.header("X-Forwarded-Host") || req.header("Host");
  if (origin && expectedHost) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === expectedHost) {
        return next();
      }
    } catch {
      // fall through to reject
    }
  }

  return next(new ApiError(403, "CSRF validation failed."));
}

module.exports = csrfProtect;

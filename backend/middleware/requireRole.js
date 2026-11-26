const ApiError = require("../utils/ApiError");

function requireRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required."));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          403,
          `Access restricted. Required role: ${allowedRoles.join(" or ")}.`,
        ),
      );
    }
    return next();
  };
}

module.exports = requireRoles;

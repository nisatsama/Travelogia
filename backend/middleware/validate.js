const { sanitizeObject } = require("../utils/sanitize");

function sanitizeRequest(req, res, next) {
  if (req.body && typeof req.body === "object") {
    req.body = sanitizeObject(req.body);
  }
  next();
}

function validate(validatorFn) {
  return (req, res, next) => {
    try {
      const validated = validatorFn(req);
      if (validated && typeof validated === "object") {
        req.validated = validated;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  sanitizeRequest,
  validate,
};

const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { authLimiter } = require("../middleware/rateLimiter");
const { validateSignup, validateLogin } = require("../validators/authValidator");

router.post("/signup", authLimiter, validate(validateSignup), authController.signup);
router.post("/login", authLimiter, validate(validateLogin), authController.login);
router.post("/logout", authController.logout);
router.get("/me", auth, authController.me);
router.get("/admin-bootstrap-status", authController.adminBootstrapStatus);
router.post(
  "/claim-admin",
  authLimiter,
  validate(validateSignup),
  authController.claimInitialAdmin,
);

module.exports = router;

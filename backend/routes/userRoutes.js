const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { validateProfileUpdate } = require("../validators/authValidator");

router.get("/", auth, userController.getProfile);
router.put("/", auth, validate(validateProfileUpdate), userController.updateProfile);

module.exports = router;

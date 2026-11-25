const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/admin");
const { validate } = require("../middleware/validate");
const { validateSignup } = require("../validators/authValidator");

router.use(auth, adminOnly);

router.get("/overview", adminController.getAdminOverview);
router.get("/travels", adminController.getAdminTravels);
router.get("/bookings", adminController.getAdminBookings);
router.get("/users", adminController.getAdminUsers);
router.post("/users", validate(validateSignup), adminController.createAdminUser);
router.patch("/users/:id/role", adminController.updateUserRole);

module.exports = router;

const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/bookingController");
const auth = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { validateBookingCreate } = require("../validators/bookingValidator");

router.get("/", auth, bookingController.getMyBookings);
router.post(
  "/",
  auth,
  validate(validateBookingCreate),
  bookingController.createBooking,
);
router.get("/:id", auth, bookingController.getBookingById);
router.patch("/:id/cancel", auth, bookingController.cancelBooking);

module.exports = router;

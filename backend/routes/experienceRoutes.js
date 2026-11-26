const express = require("express");
const requireAuth = require("../middleware/auth");
const experienceController = require("../controllers/experienceController");

const router = express.Router();

// Module 22 — Activities & Experiences
router.get("/activities", experienceController.listActivities);
router.post("/activities/book", requireAuth, experienceController.bookActivity);
router.get("/activities/bookings/mine", requireAuth, experienceController.listMyActivityBookings);
router.patch("/activities/bookings/:id/cancel", requireAuth, experienceController.cancelActivityBooking);

// Module 23 — Local Tour Guide Marketplace
router.get("/guides", experienceController.listTourGuides);
router.post("/guides/book", requireAuth, experienceController.requestGuideBooking);
router.get("/guides/bookings/mine", requireAuth, experienceController.listMyGuideBookings);
router.patch("/guides/bookings/:id/status", requireAuth, experienceController.updateGuideBookingStatus);
router.post("/guides/:id/reviews", requireAuth, experienceController.submitGuideReview);

// Module 24 — Restaurant Discovery & Reservations
router.get("/restaurants", experienceController.listRestaurants);
router.post("/restaurants/reserve", requireAuth, experienceController.reserveRestaurantTable);
router.get("/restaurants/reservations/mine", requireAuth, experienceController.listMyRestaurantReservations);
router.patch("/restaurants/reservations/:id/cancel", requireAuth, experienceController.cancelRestaurantReservation);

module.exports = router;

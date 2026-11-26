const express = require("express");
const requireAuth = require("../middleware/auth");
const transportController = require("../controllers/transportController");

const router = express.Router();

// Module 17 — Flights (Honest redirect + save external PNR reference)
router.get("/flights/airports", transportController.listAirports);
router.get("/flights/search", transportController.searchFlights);
router.post("/flights/save-reference", requireAuth, transportController.saveExternalFlightReference);

// Module 18 — Trains (Reference schedules + IRCTC official links + save PNR)
router.get("/trains/stations", transportController.listRailStations);
router.get("/trains/search", transportController.searchTrains);
router.post("/trains/save-reference", requireAuth, transportController.saveExternalTrainReference);

// Module 19 — Bus Booking System (Demo operators + seat double-booking prevention)
router.get("/buses/search", transportController.searchBuses);
router.post("/buses/book", requireAuth, transportController.bookBusSeats);

// Module 20 — Car Rental & Local Transport
router.get("/cars/search", transportController.searchCars);
router.post("/cars/book", requireAuth, transportController.bookCarTransport);

// Module 21 — Unified Transport Timeline
router.get("/reservations/mine", requireAuth, transportController.listMyTransportTimeline);
router.patch("/reservations/:id/cancel", requireAuth, transportController.cancelTransportReservation);

module.exports = router;

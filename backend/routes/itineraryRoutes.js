const express = require("express");
const auth = require("../middleware/auth");
const { aiFeatureLimiter } = require("../middleware/rateLimiter");
const controller = require("../controllers/itineraryController");

const router = express.Router();

router.use(auth);
router.post("/generate", aiFeatureLimiter, controller.generateItinerary);
router.post("/:id/regenerate-day", aiFeatureLimiter, controller.regenerateDay);
router.get("/", controller.listMyItineraries);
router.get("/:id", controller.getItinerary);
router.put("/:id", controller.updateItinerary);
router.delete("/:id", controller.deleteItinerary);

module.exports = router;

const express = require("express");
const router = express.Router();
const travelController = require("../controllers/travelController");
const auth = require("../middleware/auth");
const adminOnly = require("../middleware/admin");
const { validate } = require("../middleware/validate");
const {
  validateTravelCreate,
  validateTravelUpdate,
} = require("../validators/travelValidator");

router.get("/", travelController.getTravels);
router.get("/facets", travelController.getTravelFacets);
router.get("/:id", travelController.getTravelById);

// Admin-protected destination management
router.post(
  "/",
  auth,
  adminOnly,
  validate(validateTravelCreate),
  travelController.createTravel,
);
router.put(
  "/:id",
  auth,
  adminOnly,
  validate(validateTravelUpdate),
  travelController.updateTravel,
);
router.delete("/:id", auth, adminOnly, travelController.deleteTravel);
router.post("/:id/accessibility", auth, travelController.updateTravelAccessibility);

module.exports = router;

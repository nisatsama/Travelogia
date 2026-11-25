const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/collabTripController");

const router = express.Router();

router.use(auth);

router.get("/", controller.listMyTrips);
router.post("/", controller.createTrip);
router.post("/join", controller.joinTripByCode);
router.get("/:id", controller.getTrip);
router.patch("/:id/members/:memberUserId", controller.updateMemberRole);

router.post("/:id/destinations", controller.addDestination);
router.delete("/:id/destinations/:travelId", controller.removeDestination);
router.post("/:id/destinations/:travelId/vote", controller.voteDestination);

router.post("/:id/activities", controller.addActivity);
router.patch("/:id/activities/:activityId", controller.updateActivity);
router.post("/:id/activities/:activityId/vote", controller.voteActivity);

router.post("/:id/comments", controller.addComment);
router.post("/:id/expenses", controller.addExpense);

module.exports = router;

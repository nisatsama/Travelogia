const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/priceWatchController");

const router = express.Router();

router.get("/history/:travelId", controller.getPriceHistory);
router.post("/observations", auth, controller.addPriceObservation);

router.get("/alerts", auth, controller.listMyAlerts);
router.post("/alerts", auth, controller.createAlert);
router.delete("/alerts/:id", auth, controller.deleteAlert);
router.post("/alerts/evaluate", auth, controller.evaluateAlerts);

router.get("/notifications", auth, controller.listMyNotifications);
router.patch("/notifications/:id/read", auth, controller.markNotificationRead);

module.exports = router;

const express = require("express");
const auth = require("../middleware/auth");
const { aiFeatureLimiter } = require("../middleware/rateLimiter");
const controller = require("../controllers/packingController");

const router = express.Router();

router.post("/generate", aiFeatureLimiter, controller.generatePackingPlan);
router.get("/", auth, controller.listMyPackingLists);
router.post("/", auth, controller.savePackingList);
router.put("/:id", auth, controller.updatePackingList);
router.delete("/:id", auth, controller.deletePackingList);

module.exports = router;

const express = require("express");
const auth = require("../middleware/auth");
const controller = require("../controllers/budgetController");

const router = express.Router();

router.post("/calculate", controller.calculateBudget);
router.post("/compare", controller.compareScenarios);

router.get("/", auth, controller.listMyBudgets);
router.post("/", auth, controller.createBudgetPlan);
router.put("/:id", auth, controller.updateBudgetPlan);
router.delete("/:id", auth, controller.deleteBudgetPlan);

module.exports = router;

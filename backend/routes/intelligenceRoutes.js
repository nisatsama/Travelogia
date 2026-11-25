const express = require("express");
const auth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { aiFeatureLimiter } = require("../middleware/rateLimiter");
const controller = require("../controllers/intelligenceController");

const routePlannerRouter = express.Router();
routePlannerRouter.get("/hubs", controller.listStartingHubs);
routePlannerRouter.post("/optimize", controller.optimizeRoute);

const readinessRouter = express.Router();
readinessRouter.get("/:travelId", controller.getReadinessReport);

const hiddenGemsRouter = express.Router();
hiddenGemsRouter.get("/", controller.discoverHiddenGems);
hiddenGemsRouter.post("/ai-suggestions", aiFeatureLimiter, controller.getHiddenGemAiSuggestions);

const compareRouter = express.Router();
compareRouter.post("/", controller.compareDestinations);
compareRouter.post("/ai-summary", aiFeatureLimiter, controller.compareDestinationsAiSummary);

const recommendationsRouter = express.Router();
recommendationsRouter.get("/", optionalAuth, controller.getRecommendations);
recommendationsRouter.get("/similar/:travelId", controller.getSimilar);
recommendationsRouter.post("/track-view", optionalAuth, controller.trackView);
recommendationsRouter.put("/preferences", auth, controller.updatePreferences);
recommendationsRouter.post("/reset", auth, controller.resetPreferences);

module.exports = {
  routePlannerRouter,
  readinessRouter,
  hiddenGemsRouter,
  compareRouter,
  recommendationsRouter,
};

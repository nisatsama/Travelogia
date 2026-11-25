const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const routeService = require("../services/routeService");
const readinessService = require("../services/readinessService");
const recommendationService = require("../services/recommendationService");
const geminiService = require("../services/geminiService");

// Feature 4: Route Intelligence & Multi-Destination Optimizer
exports.optimizeRoute = asyncHandler(async (req, res) => {
  const result = await routeService.planMultiDestinationRoute(req.body || {});
  res.status(200).json({ success: true, data: result });
});

exports.listStartingHubs = asyncHandler(async (req, res) => {
  const hubs = Object.entries(routeService.STARTING_CITY_COORDS).map(([key, val]) => ({
    key,
    name: val.name,
    latitude: val.latitude,
    longitude: val.longitude,
  }));
  // Deduplicate by name
  const unique = [];
  const seen = new Set();
  hubs.forEach((h) => {
    if (!seen.has(h.name)) {
      seen.add(h.name);
      unique.push(h);
    }
  });
  res.status(200).json({ success: true, data: unique });
});

// Feature 5: Travel Readiness & Risk Intelligence
exports.getReadinessReport = asyncHandler(async (req, res) => {
  const report = await readinessService.getTravelReadinessReport(req.params.travelId);
  res.status(200).json({ success: true, data: report });
});

// Feature 6: Hidden Gems Discovery Engine ("Beyond the Tourist Trail")
exports.discoverHiddenGems = asyncHandler(async (req, res) => {
  const {
    region = "",
    category = "",
    maxPrice = "",
    interest = "",
    season = "",
    startCity = "",
    maxDistanceKm = "",
    crowdPreference = "offbeat",
    duration = "",
  } = req.query || {};

  const allTravels = await store.listAllActiveTravels();
  let gems =
    crowdPreference === "all"
      ? [...allTravels]
      : allTravels.filter((t) => Boolean(t.isHiddenGem));

  if (region && region !== "All") {
    const rLow = region.toLowerCase();
    gems = gems.filter(
      (g) =>
        String(g.region || "").toLowerCase().includes(rLow) ||
        String(g.state || "").toLowerCase().includes(rLow) ||
        String(g.country || "").toLowerCase().includes(rLow),
    );
  }
  if (category && category !== "All") {
    gems = gems.filter((g) => String(g.category).toLowerCase() === category.toLowerCase());
  }
  if (maxPrice && Number.isFinite(Number(maxPrice))) {
    gems = gems.filter((g) => Number(g.pricePerNight) <= Number(maxPrice));
  }
  if (interest && interest.trim()) {
    const term = interest.trim().toLowerCase();
    gems = gems.filter((g) =>
      `${g.title} ${g.description} ${(g.highlights || []).join(" ")} ${(g.activities || []).join(" ")}`
        .toLowerCase()
        .includes(term),
    );
  }
  if (season && season !== "All") {
    const sLow = season.toLowerCase();
    const map = {
      spring: ["march", "april", "may"],
      summer: ["may", "june", "july", "august"],
      monsoon: ["july", "august", "september"],
      autumn: ["september", "october", "november"],
      winter: ["november", "december", "january", "february"],
    };
    const tokens = map[sLow] || [sLow];
    gems = gems.filter((g) => {
      const best = String(g.bestTimeToVisit || "").toLowerCase();
      return best.includes("year-round") || tokens.some((tok) => best.includes(tok));
    });
  }
  if (duration && Number.isFinite(Number(duration))) {
    const maxDays = Number(duration);
    gems = gems.filter((g) => {
      const m = String(g.estimatedDuration || "").match(/\d+/);
      return !m || Number(m[0]) <= maxDays + 1;
    });
  }

  const startNode = startCity ? routeService.resolveStartPoint(startCity, allTravels) : null;
  let enriched = gems.map((g) => {
    const dist =
      startNode && g.coordinates && Number.isFinite(g.coordinates.latitude)
        ? routeService.haversineKm(startNode.coordinates, g.coordinates)
        : null;
    return {
      ...g,
      straightLineDistanceKm: dist,
      trailClassification: g.isHiddenGem
        ? "Curated Offbeat / Hidden Gem"
        : "Established Destination",
    };
  });

  if (startNode && maxDistanceKm && Number.isFinite(Number(maxDistanceKm))) {
    enriched = enriched.filter(
      (g) => g.straightLineDistanceKm !== null && g.straightLineDistanceKm <= Number(maxDistanceKm),
    );
  }

  if (startNode) {
    enriched.sort((a, b) => (a.straightLineDistanceKm ?? 99999) - (b.straightLineDistanceKm ?? 99999));
  } else {
    enriched.sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0));
  }

  const regions = Array.from(new Set(allTravels.filter((t) => t.isHiddenGem).map((t) => t.region).filter(Boolean))).sort();

  res.status(200).json({
    success: true,
    data: enriched,
    totalCount: enriched.length,
    availableRegions: regions,
    note: "Hidden Gem classifications are curated editorial tags (not fabricated crowd-sensor counts).",
  });
});

exports.getHiddenGemAiSuggestions = asyncHandler(async (req, res) => {
  const { interests = "", season = "", budget = "", region = "" } = req.body || {};
  const allTravels = await store.listAllActiveTravels();
  let gems = allTravels.filter((t) => Boolean(t.isHiddenGem));
  if (region && region !== "All") {
    gems = gems.filter((g) => String(g.region || "").toLowerCase().includes(region.toLowerCase()));
  }
  if (gems.length === 0) gems = allTravels.filter((t) => Boolean(t.isHiddenGem));

  const advice = await geminiService.generateHiddenGemSuggestions({
    gems,
    interests,
    season,
    budget,
  });

  res.status(200).json({
    success: true,
    data: {
      advice,
      consideredCount: gems.length,
    },
  });
});

// Feature 7: Smart Destination Comparison
exports.compareDestinations = asyncHandler(async (req, res) => {
  const { destinationIds = [], startCity = "" } = req.body || {};
  if (!Array.isArray(destinationIds)) {
    throw new ApiError(400, "destinationIds must be an array of 2 to 3 destination IDs.");
  }
  const uniqueIds = Array.from(new Set(destinationIds.map((id) => String(id).trim()).filter(Boolean)));
  if (uniqueIds.length < 2 || uniqueIds.length > 3) {
    throw new ApiError(400, "Select 2 or 3 distinct destinations to compare side-by-side.");
  }

  const allTravels = await store.listAllActiveTravels();
  const destinations = uniqueIds
    .map((id) => allTravels.find((t) => t._id === id))
    .filter(Boolean);

  if (destinations.length < 2) {
    throw new ApiError(404, "At least 2 valid destinations from the catalogue are required.");
  }

  const startNode = startCity ? routeService.resolveStartPoint(startCity, allTravels) : null;

  const enriched = destinations.map((d) => {
    const straightLineKm =
      startNode && d.coordinates && Number.isFinite(d.coordinates.latitude)
        ? routeService.haversineKm(startNode.coordinates, d.coordinates)
        : null;
    const acc = d.accessibility || {};
    const yesCount = [
      acc.wheelchairAccessible,
      acc.accessibleAccommodation,
      acc.publicTransport,
      acc.familyFriendly,
      acc.accessibleAttractions,
    ].filter((v) => v === "yes").length;

    return {
      ...d,
      distanceFromStartKm: straightLineKm,
      verifiedAccessibilityScore: yesCount,
    };
  });

  const cheapest = [...enriched].sort((a, b) => a.pricePerNight - b.pricePerNight)[0];
  const highestRated = [...enriched].sort((a, b) => b.rating - a.rating)[0];
  const mostAccessible = [...enriched].sort(
    (a, b) => b.verifiedAccessibilityScore - a.verifiedAccessibilityScore,
  )[0];
  const closest = startNode
    ? [...enriched]
        .filter((d) => d.distanceFromStartKm !== null)
        .sort((a, b) => a.distanceFromStartKm - b.distanceFromStartKm)[0] || null
    : null;

  res.status(200).json({
    success: true,
    data: {
      startHub: startNode,
      destinations: enriched,
      advantages: {
        mostBudgetFriendlyId: cheapest._id,
        highestRatedId: highestRated._id,
        mostAccessibleId: mostAccessible.verifiedAccessibilityScore > 0 ? mostAccessible._id : null,
        closestFromStartId: closest ? closest._id : null,
      },
      disclaimer:
        "Prices are Travelogia planning estimates; distances from starting city are Haversine straight-line estimates.",
    },
  });
});

exports.compareDestinationsAiSummary = asyncHandler(async (req, res) => {
  const { destinationIds = [], startCity = "", preferences = "" } = req.body || {};
  const uniqueIds = Array.from(new Set((destinationIds || []).map(String).filter(Boolean)));
  if (uniqueIds.length < 2 || uniqueIds.length > 3) {
    throw new ApiError(400, "Provide 2 or 3 distinct destination IDs.");
  }

  const allTravels = await store.listAllActiveTravels();
  const destinations = uniqueIds
    .map((id) => allTravels.find((t) => t._id === id))
    .filter(Boolean);
  if (destinations.length < 2) {
    throw new ApiError(404, "Could not find the requested destinations.");
  }

  const summary = await geminiService.generateComparisonSummary({
    destinations,
    startingCity: startCity,
    preferences,
  });

  res.status(200).json({ success: true, data: { summary } });
});

// Feature 8: Personalized Travel Recommendation Engine
exports.getRecommendations = asyncHandler(async (req, res) => {
  const limit = Math.min(16, Math.max(2, Number(req.query?.limit || 8)));
  const result = await recommendationService.getPersonalizedRecommendations(
    req.user ? req.user.id : null,
    limit,
  );
  res.status(200).json({ success: true, data: result });
});

exports.getSimilar = asyncHandler(async (req, res) => {
  const items = await recommendationService.getSimilarDestinations(req.params.travelId, 4);
  res.status(200).json({ success: true, data: items });
});

exports.trackView = asyncHandler(async (req, res) => {
  const travelId = String(req.body?.travelId || "").trim();
  if (!travelId) throw new ApiError(400, "travelId is required.");

  await store.incrementTravelView(travelId);

  if (req.user) {
    const prefs = await v2Store.getUserPreference(req.user.id);
    const viewed = Array.from(new Set([travelId, ...(prefs.viewedDestinationIds || [])])).slice(0, 25);
    await v2Store.upsertUserPreference(req.user.id, { viewedDestinationIds: viewed });
  }

  res.status(200).json({ success: true });
});

exports.updatePreferences = asyncHandler(async (req, res) => {
  const body = req.body || {};
  const updates = {};
  if (Array.isArray(body.preferredCategories)) {
    updates.preferredCategories = body.preferredCategories.map(String).slice(0, 8);
  }
  if (Array.isArray(body.interests)) {
    updates.interests = body.interests.map(String).slice(0, 12);
  }
  if (Number.isFinite(Number(body.minBudgetPerNight))) {
    updates.minBudgetPerNight = Math.max(0, Number(body.minBudgetPerNight));
  }
  if (Number.isFinite(Number(body.maxBudgetPerNight))) {
    updates.maxBudgetPerNight = Math.max(10, Number(body.maxBudgetPerNight));
  }
  if (Number.isFinite(Number(body.preferredDurationDays))) {
    updates.preferredDurationDays = Math.min(30, Math.max(1, Number(body.preferredDurationDays)));
  }
  if (typeof body.preferredSeason === "string") {
    updates.preferredSeason = body.preferredSeason.trim().slice(0, 30);
  }
  if (body.weights && typeof body.weights === "object") {
    updates.weights = recommendationService.normalizeWeights(body.weights);
  }

  const saved = await v2Store.upsertUserPreference(req.user.id, updates);
  const refreshed = await recommendationService.getPersonalizedRecommendations(req.user.id, 8);
  res.status(200).json({ success: true, preferences: saved, data: refreshed });
});

exports.resetPreferences = asyncHandler(async (req, res) => {
  const reset = await v2Store.resetUserPreference(req.user.id);
  const refreshed = await recommendationService.getPersonalizedRecommendations(req.user.id, 8);
  res.status(200).json({ success: true, preferences: reset, data: refreshed });
});

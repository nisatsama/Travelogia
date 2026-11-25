const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const geminiService = require("../services/geminiService");
const { calculateAndOptimizeBudget } = require("../services/budgetService");

function sanitizeDayPlan(rawDay, dayIndex, validTravelsMap) {
  const candidateId = typeof rawDay?.destinationId === "string" ? rawDay.destinationId.trim() : "";
  const matchedTravel = candidateId && validTravelsMap.has(candidateId)
    ? validTravelsMap.get(candidateId)
    : null;

  const toStrArray = (arr) =>
    Array.isArray(arr)
      ? arr.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 8)
      : [];

  return {
    dayNumber: Number.isInteger(Number(rawDay?.dayNumber)) ? Number(rawDay.dayNumber) : dayIndex + 1,
    title: String(rawDay?.title || `Day ${dayIndex + 1}`).trim().slice(0, 160),
    destinationId: matchedTravel ? matchedTravel._id : "",
    destinationTitle: matchedTravel
      ? matchedTravel.title
      : String(rawDay?.destinationTitle || "").trim().slice(0, 120),
    activities: toStrArray(rawDay?.activities),
    attractions: toStrArray(rawDay?.attractions),
    accommodationArea: String(rawDay?.accommodationArea || "").trim().slice(0, 140),
    foodRecommendations: toStrArray(rawDay?.foodRecommendations),
    alternativeActivities: toStrArray(rawDay?.alternativeActivities),
    travelTips: toStrArray(rawDay?.travelTips),
    notes: String(rawDay?.notes || "").trim().slice(0, 400),
  };
}

exports.generateItinerary = asyncHandler(async (req, res) => {
  const {
    startingCity = "Kolkata",
    destinationPreferences = [],
    startDate = "",
    days = 4,
    travelers = 2,
    totalBudget = 1200,
    currency = "USD",
    travelStyle = "balanced",
    interests = [],
    preferredActivities = [],
    accommodationPreference = "mid-range",
  } = req.body || {};

  const numDays = Number(days);
  const numTravelers = Number(travelers);
  const numBudget = Number(totalBudget);

  if (!startingCity || typeof startingCity !== "string" || startingCity.trim().length < 2) {
    throw new ApiError(400, "Starting city is required.");
  }
  if (!Number.isInteger(numDays) || numDays < 1 || numDays > 21) {
    throw new ApiError(400, "Duration must be between 1 and 21 days.");
  }
  if (!Number.isInteger(numTravelers) || numTravelers < 1 || numTravelers > 20) {
    throw new ApiError(400, "Travelers must be between 1 and 20.");
  }
  if (!Number.isFinite(numBudget) || numBudget <= 0) {
    throw new ApiError(400, "Total budget must be a positive number.");
  }

  const normalizedCurrency = currency === "INR" ? "INR" : "USD";
  const prefList = Array.isArray(destinationPreferences)
    ? destinationPreferences.map((s) => String(s).trim()).filter(Boolean)
    : typeof destinationPreferences === "string" && destinationPreferences.trim()
      ? destinationPreferences.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
  const interestList = Array.isArray(interests)
    ? interests.map((s) => String(s).trim()).filter(Boolean)
    : [];
  const activityList = Array.isArray(preferredActivities)
    ? preferredActivities.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const allTravels = await store.listAllActiveTravels();
  const validTravelsMap = new Map(allTravels.map((t) => [t._id, t]));

  // Find grounded catalogue candidates matching preferences/interests
  const queryTerms = [...prefList, ...interestList, ...activityList].map((s) => s.toLowerCase());
  const rankedCandidates = [...allTravels]
    .map((t) => {
      const hay = `${t.title} ${t.city} ${t.state || ""} ${t.region || ""} ${t.country} ${t.category} ${(t.highlights || []).join(" ")}`.toLowerCase();
      let score = Number(t.rating || 4.5);
      queryTerms.forEach((term) => {
        if (term.length > 2 && hay.includes(term)) score += 5;
      });
      return { travel: t, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)
    .map((x) => x.travel);

  const aiPlan = await geminiService.generateStructuredItinerary({
    startingCity: startingCity.trim(),
    destinationPreferences: prefList,
    startDate,
    days: numDays,
    travelers: numTravelers,
    totalBudget: numBudget,
    currency: normalizedCurrency,
    travelStyle,
    interests: interestList,
    preferredActivities: activityList,
    accommodationPreference,
    candidateDestinations: rankedCandidates,
  });

  // Strictly validate EVERY destinationId against the Travelogia DB catalogue
  const validatedDays = aiPlan.dayPlans
    .slice(0, numDays)
    .map((day, idx) => sanitizeDayPlan(day, idx, validTravelsMap));

  const groundedDestinationIds = Array.from(
    new Set(validatedDays.map((d) => d.destinationId).filter(Boolean)),
  );

  // Authoritative server-calculated budget (NEVER trust AI prices)
  const budgetBreakdown = await calculateAndOptimizeBudget({
    totalBudget: numBudget,
    currency: normalizedCurrency,
    travelers: numTravelers,
    duration: validatedDays.length || numDays,
    destinationIds: groundedDestinationIds,
    accommodationPreference: ["budget", "mid-range", "luxury"].includes(accommodationPreference)
      ? accommodationPreference
      : "mid-range",
    activities: activityList,
  });

  const saved = await v2Store.createItinerary({
    user: req.user.id,
    title: String(aiPlan.title || `${numDays}-Day Trip from ${startingCity.trim()}`).slice(0, 160),
    startingCity: startingCity.trim(),
    destinationPreferences: prefList,
    startDate: String(startDate || ""),
    days: validatedDays.length,
    travelers: numTravelers,
    totalBudget: numBudget,
    currency: normalizedCurrency,
    travelStyle: String(travelStyle || "balanced"),
    interests: interestList,
    preferredActivities: activityList,
    accommodationPreference: String(accommodationPreference || "mid-range"),
    dayPlans: validatedDays,
    groundedDestinationIds,
    budgetSummary: {
      estimatedGroupTotal: budgetBreakdown.estimatedGroupTotal,
      estimatedPerPerson: budgetBreakdown.estimatedPerPerson,
      overBudget: budgetBreakdown.overBudget,
      categories: budgetBreakdown.categories,
      disclaimer: budgetBreakdown.disclaimer,
    },
  });

  const groundedDestinations = groundedDestinationIds
    .map((id) => validTravelsMap.get(id))
    .filter(Boolean)
    .map((d) => ({
      _id: d._id,
      title: d.title,
      city: d.city,
      country: d.country,
      coordinates: d.coordinates,
      pricePerNight: d.pricePerNight,
    }));

  res.status(201).json({
    success: true,
    data: saved,
    groundedDestinations,
    budgetOptimization: budgetBreakdown,
  });
});

exports.regenerateDay = asyncHandler(async (req, res) => {
  const itinerary = await v2Store.findItineraryById(req.params.id);
  if (!itinerary) {
    throw new ApiError(404, "Itinerary not found.");
  }
  if (String(itinerary.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to edit this itinerary.");
  }

  const dayNumber = Number(req.body?.dayNumber);
  const focusNote = String(req.body?.focusNote || "").trim().slice(0, 250);
  const idx = (itinerary.dayPlans || []).findIndex((d) => Number(d.dayNumber) === dayNumber);
  if (idx === -1) {
    throw new ApiError(400, "Requested dayNumber does not exist in this itinerary.");
  }

  const allTravels = await store.listAllActiveTravels();
  const validTravelsMap = new Map(allTravels.map((t) => [t._id, t]));

  const regeneratedRaw = await geminiService.regenerateItineraryDay({
    itinerary,
    dayNumber,
    focusNote,
    candidateDestinations: allTravels.slice(0, 12),
  });

  const sanitizedDay = sanitizeDayPlan({ ...regeneratedRaw, dayNumber }, idx, validTravelsMap);
  const nextDays = [...itinerary.dayPlans];
  nextDays[idx] = sanitizedDay;

  const groundedDestinationIds = Array.from(
    new Set(nextDays.map((d) => d.destinationId).filter(Boolean)),
  );
  const budgetBreakdown = await calculateAndOptimizeBudget({
    totalBudget: itinerary.totalBudget,
    currency: itinerary.currency,
    travelers: itinerary.travelers,
    duration: nextDays.length,
    destinationIds: groundedDestinationIds,
    accommodationPreference: itinerary.accommodationPreference || "mid-range",
  });

  const updated = await v2Store.updateItinerary(itinerary._id, {
    dayPlans: nextDays,
    groundedDestinationIds,
    budgetSummary: {
      estimatedGroupTotal: budgetBreakdown.estimatedGroupTotal,
      estimatedPerPerson: budgetBreakdown.estimatedPerPerson,
      overBudget: budgetBreakdown.overBudget,
      categories: budgetBreakdown.categories,
      disclaimer: budgetBreakdown.disclaimer,
    },
  });

  res.status(200).json({ success: true, data: updated });
});

exports.listMyItineraries = asyncHandler(async (req, res) => {
  const items = await v2Store.listUserItineraries(req.user.id);
  res.status(200).json({ success: true, data: items });
});

exports.getItinerary = asyncHandler(async (req, res) => {
  const item = await v2Store.findItineraryById(req.params.id);
  if (!item) throw new ApiError(404, "Itinerary not found.");
  if (String(item.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to view this itinerary.");
  }
  res.status(200).json({ success: true, data: item });
});

exports.updateItinerary = asyncHandler(async (req, res) => {
  const existing = await v2Store.findItineraryById(req.params.id);
  if (!existing) throw new ApiError(404, "Itinerary not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to update this itinerary.");
  }

  const updates = {};
  if (typeof req.body?.title === "string" && req.body.title.trim()) {
    updates.title = req.body.title.trim().slice(0, 160);
  }
  if (Array.isArray(req.body?.dayPlans) && req.body.dayPlans.length > 0) {
    const allTravels = await store.listAllActiveTravels();
    const validTravelsMap = new Map(allTravels.map((t) => [t._id, t]));
    updates.dayPlans = req.body.dayPlans.map((d, i) => sanitizeDayPlan(d, i, validTravelsMap));
    updates.days = updates.dayPlans.length;
    updates.groundedDestinationIds = Array.from(
      new Set(updates.dayPlans.map((d) => d.destinationId).filter(Boolean)),
    );
  }

  const updated = await v2Store.updateItinerary(existing._id, updates);
  res.status(200).json({ success: true, data: updated });
});

exports.deleteItinerary = asyncHandler(async (req, res) => {
  const existing = await v2Store.findItineraryById(req.params.id);
  if (!existing) throw new ApiError(404, "Itinerary not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to delete this itinerary.");
  }
  await v2Store.deleteItinerary(existing._id);
  res.status(200).json({ success: true, message: "Itinerary deleted." });
});

const ApiError = require("../utils/ApiError");
const store = require("./storeService");

const USD_TO_INR = 84;

const ACCOMMODATION_MULTIPLIERS = {
  budget: 0.65,
  "mid-range": 1.0,
  luxury: 1.85,
};

const TRANSPORT_PER_PERSON_USD = {
  "public-bus": 28,
  "train-or-economy": 55,
  "domestic-flight": 135,
  "private-car": 110,
};

const CATEGORY_LABELS = [
  { key: "transportation", label: "Transportation" },
  { key: "accommodation", label: "Accommodation" },
  { key: "food", label: "Food & Dining" },
  { key: "activities", label: "Activities & Entry" },
  { key: "localTransport", label: "Local Transport" },
  { key: "miscellaneous", label: "Miscellaneous" },
  { key: "emergencyReserve", label: "Emergency Reserve" },
];

async function calculateAndOptimizeBudget({
  totalBudget,
  currency = "USD",
  travelers = 1,
  duration = 3,
  destinationIds = [],
  accommodationPreference = "mid-range",
  transportPreference = "train-or-economy",
  activities = [],
  manualOverrides = null,
}) {
  const budgetNum = Number(totalBudget);
  const travNum = Number(travelers);
  const durNum = Number(duration);

  if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
    throw new ApiError(400, "totalBudget must be a positive number.");
  }
  if (!Number.isInteger(travNum) || travNum < 1 || travNum > 30) {
    throw new ApiError(400, "travelers must be an integer between 1 and 30.");
  }
  if (!Number.isInteger(durNum) || durNum < 1 || durNum > 60) {
    throw new ApiError(400, "duration must be an integer between 1 and 60 days.");
  }

  const fx = currency === "INR" ? USD_TO_INR : 1;
  const allTravels = await store.listAllActiveTravels();
  const selectedDestinations = destinationIds
    .map((id) => allTravels.find((t) => t._id === id))
    .filter(Boolean);

  // Average nightly estimate from DB destinations (or sensible baseline of $75/night)
  const avgNightlyUSD =
    selectedDestinations.length > 0
      ? selectedDestinations.reduce((acc, d) => acc + Number(d.pricePerNight || 75), 0) /
        selectedDestinations.length
      : 75;

  const accomMult = ACCOMMODATION_MULTIPLIERS[accommodationPreference] || 1.0;
  const transportBaseUSD = TRANSPORT_PER_PERSON_USD[transportPreference] || 55;
  const roomsNeeded = Math.ceil(travNum / 2);

  // Deterministic server-side cost calculation (clearly marked as planning estimates)
  const rawEstimatesUSD = {
    transportation: Math.round(transportBaseUSD * travNum * Math.max(1, selectedDestinations.length * 0.65)),
    accommodation: Math.round(avgNightlyUSD * accomMult * roomsNeeded * durNum),
    food: Math.round((accommodationPreference === "luxury" ? 42 : accommodationPreference === "budget" ? 14 : 24) * travNum * durNum),
    activities: Math.round((15 + Math.min(activities.length, 6) * 8) * travNum * Math.max(1, Math.ceil(durNum / 2))),
    localTransport: Math.round(10 * travNum * durNum),
    miscellaneous: Math.round(8 * travNum * durNum),
  };
  const subtotalUSD = Object.values(rawEstimatesUSD).reduce((s, v) => s + v, 0);
  rawEstimatesUSD.emergencyReserve = Math.round(subtotalUSD * 0.08);

  const categories = CATEGORY_LABELS.map(({ key, label }) => {
    const defaultVal = Math.round(rawEstimatesUSD[key] * fx);
    const manualVal =
      manualOverrides && Number.isFinite(Number(manualOverrides[key])) && Number(manualOverrides[key]) >= 0
        ? Math.round(Number(manualOverrides[key]))
        : defaultVal;
    return {
      key,
      label,
      estimated: manualVal,
      actual: 0,
      percentage: 0,
    };
  });

  const estimatedGroupTotal = categories.reduce((sum, c) => sum + c.estimated, 0);
  categories.forEach((c) => {
    c.percentage =
      estimatedGroupTotal > 0 ? Math.round((c.estimated / estimatedGroupTotal) * 100) : 0;
  });

  const estimatedPerPerson = Math.round(estimatedGroupTotal / travNum);
  const overBudget = estimatedGroupTotal > budgetNum;
  const overBudgetAmount = overBudget ? estimatedGroupTotal - budgetNum : 0;

  const optimizationSuggestions = [];
  let revisedPlan = null;

  if (overBudget) {
    const reductionRatio = budgetNum / estimatedGroupTotal;
    if (accommodationPreference !== "budget") {
      optimizationSuggestions.push(
        `Switch accommodation from "${accommodationPreference}" to "budget" homestays or boutique guesthouses to save ~30–35% on stays.`,
      );
    }
    if (transportPreference === "domestic-flight" || transportPreference === "private-car") {
      optimizationSuggestions.push(
        `Consider train or economy regional transit instead of "${transportPreference}" to cut transportation costs significantly.`,
      );
    }
    if (durNum > 2) {
      optimizationSuggestions.push(
        `Trimming 1 day from a ${durNum}-day trip reduces lodging, food, and local transit estimates proportionally.`,
      );
    }
    optimizationSuggestions.push(
      `Prioritize free local attractions (scenic viewpoints, heritage walks, local markets) and cap paid tours.`,
    );

    // Generate a concrete revised target allocation matching user's exact target budget
    const revisedCategories = categories.map((c) => ({
      ...c,
      estimated: Math.max(0, Math.floor(c.estimated * reductionRatio)),
    }));
    // Adjust rounding remainder onto emergencyReserve/miscellaneous so sum === budgetNum
    const revisedSum = revisedCategories.reduce((s, c) => s + c.estimated, 0);
    const diff = budgetNum - revisedSum;
    if (diff > 0 && revisedCategories.length > 0) {
      revisedCategories[revisedCategories.length - 1].estimated += diff;
    }
    revisedCategories.forEach((c) => {
      c.percentage = budgetNum > 0 ? Math.round((c.estimated / budgetNum) * 100) : 0;
    });

    revisedPlan = {
      targetBudget: budgetNum,
      revisedGroupTotal: revisedCategories.reduce((s, c) => s + c.estimated, 0),
      revisedPerPerson: Math.round(budgetNum / travNum),
      savingsAchieved: overBudgetAmount,
      categories: revisedCategories,
    };
  } else {
    optimizationSuggestions.push(
      `Your estimated plan fits within your ${currency} ${budgetNum.toLocaleString()} target with a ${currency} ${(budgetNum - estimatedGroupTotal).toLocaleString()} cushion.`,
    );
  }

  // Suggest cheaper catalogue alternatives if over budget or requested
  const maxNightlyTargetUSD = (budgetNum / fx) / Math.max(1, durNum * roomsNeeded) * 0.45;
  const cheaperAlternatives = allTravels
    .filter(
      (d) =>
        !destinationIds.includes(d._id) &&
        d.pricePerNight <= Math.max(60, Math.min(avgNightlyUSD * 0.85, maxNightlyTargetUSD * 1.4)),
    )
    .sort((a, b) => a.pricePerNight - b.pricePerNight || b.rating - a.rating)
    .slice(0, 4)
    .map((d) => ({
      _id: d._id,
      title: d.title,
      city: d.city,
      country: d.country,
      category: d.category,
      estimatedPricePerNightUSD: d.pricePerNight,
      estimatedPricePerNightLocal: Math.round(d.pricePerNight * fx),
    }));

  return {
    currency,
    totalBudget: budgetNum,
    travelers: travNum,
    duration: durNum,
    accommodationPreference,
    transportPreference,
    categories,
    estimatedGroupTotal,
    estimatedPerPerson,
    overBudget,
    overBudgetAmount,
    optimizationSuggestions,
    revisedPlan,
    cheaperAlternatives,
    disclaimer:
      "All figures are server-calculated planning estimates based on Travelogia catalogue baselines and are not live airline or hotel market prices.",
  };
}

module.exports = {
  USD_TO_INR,
  calculateAndOptimizeBudget,
};

const store = require("./storeService");
const v2Store = require("./v2StoreService");

const DEFAULT_WEIGHTS = {
  interest: 0.3,
  budget: 0.25,
  category: 0.2,
  season: 0.15,
  duration: 0.1,
};

function normalizeWeights(raw = {}) {
  const merged = {
    interest: Math.max(0, Number(raw.interest ?? DEFAULT_WEIGHTS.interest) || 0),
    budget: Math.max(0, Number(raw.budget ?? DEFAULT_WEIGHTS.budget) || 0),
    category: Math.max(0, Number(raw.category ?? DEFAULT_WEIGHTS.category) || 0),
    season: Math.max(0, Number(raw.season ?? DEFAULT_WEIGHTS.season) || 0),
    duration: Math.max(0, Number(raw.duration ?? DEFAULT_WEIGHTS.duration) || 0),
  };
  const total = Object.values(merged).reduce((s, v) => s + v, 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return {
    interest: Math.round((merged.interest / total) * 1000) / 1000,
    budget: Math.round((merged.budget / total) * 1000) / 1000,
    category: Math.round((merged.category / total) * 1000) / 1000,
    season: Math.round((merged.season / total) * 1000) / 1000,
    duration: Math.round((merged.duration / total) * 1000) / 1000,
  };
}

function parseDurationDays(text = "") {
  const nums = String(text).match(/\d+/g);
  if (!nums || nums.length === 0) return 4;
  if (nums.length === 1) return Number(nums[0]);
  return (Number(nums[0]) + Number(nums[1])) / 2;
}

function scoreDestination(dest, profile, weights) {
  const reasons = [];
  const searchable = [
    dest.title,
    dest.category,
    dest.region,
    dest.description,
    ...(dest.highlights || []),
    ...(dest.activities || []),
  ]
    .join(" ")
    .toLowerCase();

  // 1. Interest match (default 30%)
  let interestScore = 0.55;
  if (profile.interests.length > 0) {
    const matchedInterests = profile.interests.filter((term) =>
      searchable.includes(term.toLowerCase()),
    );
    interestScore = matchedInterests.length / profile.interests.length;
    if (matchedInterests.length > 0) {
      reasons.push(`Matches interests: ${matchedInterests.slice(0, 2).join(", ")}`);
    }
  } else if (dest.rating >= 4.7) {
    interestScore = 0.85;
  }

  // 2. Budget fit (default 25%)
  const minB = Number(profile.minBudgetPerNight || 0);
  const maxB = Number(profile.maxBudgetPerNight || 500);
  const price = Number(dest.pricePerNight || 80);
  let budgetScore = 0.5;
  if (price >= minB && price <= maxB) {
    budgetScore = 1.0;
    reasons.push(`Fits your $${minB}–$${maxB}/night estimate range`);
  } else if (price < minB) {
    budgetScore = 0.8;
    reasons.push(`Budget-friendly option ($${price}/night est.)`);
  } else {
    const overshoot = (price - maxB) / Math.max(maxB, 50);
    budgetScore = Math.max(0.1, 1 - overshoot);
  }

  // 3. Category preference (default 20%)
  let categoryScore = 0.5;
  if (profile.preferredCategories.length > 0) {
    if (
      profile.preferredCategories
        .map((c) => c.toLowerCase())
        .includes(String(dest.category || "").toLowerCase())
    ) {
      categoryScore = 1.0;
      reasons.push(`Matches your ${dest.category} travel preference`);
    } else {
      categoryScore = 0.25;
    }
  }

  // 4. Season match (default 15%)
  let seasonScore = 0.65;
  if (profile.preferredSeason) {
    const best = String(dest.bestTimeToVisit || "").toLowerCase();
    const s = profile.preferredSeason.toLowerCase();
    const seasonMonths = {
      spring: ["march", "april", "may"],
      summer: ["may", "june", "july", "august"],
      monsoon: ["july", "august", "september"],
      autumn: ["september", "october", "november"],
      winter: ["november", "december", "january", "february"],
    };
    const tokens = seasonMonths[s] || [s];
    if (best.includes("year-round") || tokens.some((tok) => best.includes(tok))) {
      seasonScore = 1.0;
      reasons.push(`Ideal visiting window for ${profile.preferredSeason}`);
    } else {
      seasonScore = 0.35;
    }
  }

  // 5. Duration compatibility (default 10%)
  const targetDays = Number(profile.preferredDurationDays || 4);
  const estDays = parseDurationDays(dest.estimatedDuration);
  const diff = Math.abs(estDays - targetDays);
  const durationScore = Math.max(0.2, 1 - diff / Math.max(targetDays, 4));
  if (diff <= 1.5) {
    reasons.push(`Well suited for a ~${targetDays}-day trip`);
  }

  // Small quality tie-breaker (max +4 points) based on rating
  const weighted =
    interestScore * weights.interest +
    budgetScore * weights.budget +
    categoryScore * weights.category +
    seasonScore * weights.season +
    durationScore * weights.duration;

  const finalScore = Math.min(99, Math.max(10, Math.round(weighted * 96 + (Number(dest.rating || 4.5) - 4) * 4)));

  if (reasons.length === 0) {
    reasons.push(`Top-rated ${dest.category} destination (${dest.rating}★)`);
  }

  return {
    destination: dest,
    matchScore: finalScore,
    reasons: reasons.slice(0, 3),
    breakdown: {
      interest: Math.round(interestScore * 100),
      budget: Math.round(budgetScore * 100),
      category: Math.round(categoryScore * 100),
      season: Math.round(seasonScore * 100),
      duration: Math.round(durationScore * 100),
    },
  };
}

async function getPersonalizedRecommendations(userId, limit = 8) {
  const allTravels = await store.listAllActiveTravels();

  let preferences = {
    preferredCategories: [],
    interests: [],
    minBudgetPerNight: 20,
    maxBudgetPerNight: 300,
    preferredDurationDays: 4,
    preferredSeason: "",
    viewedDestinationIds: [],
    weights: { ...DEFAULT_WEIGHTS },
  };
  const interactedIds = new Set();

  if (userId) {
    preferences = await v2Store.getUserPreference(userId);
    const [favorites, bookings] = await Promise.all([
      store.listUserFavorites(userId).catch(() => []),
      store.listUserBookings(userId).catch(() => []),
    ]);

    const derivedCategories = new Set(preferences.preferredCategories || []);
    const derivedInterests = new Set(preferences.interests || []);

    favorites.forEach((f) => {
      const t = f.travel || f;
      if (t?._id) interactedIds.add(String(t._id));
      if (t?.category) derivedCategories.add(t.category);
    });
    bookings.forEach((b) => {
      const t = b.travel;
      if (t?._id) interactedIds.add(String(t._id));
      if (t?.category) derivedCategories.add(t.category);
    });
    (preferences.viewedDestinationIds || []).forEach((vid) => {
      const found = allTravels.find((t) => t._id === vid);
      if (found?.category) derivedCategories.add(found.category);
    });

    preferences = {
      ...preferences,
      preferredCategories: Array.from(derivedCategories).slice(0, 6),
      interests: Array.from(derivedInterests),
    };
  }

  const weights = normalizeWeights(preferences.weights);

  const scored = allTravels
    .map((dest) => scoreDestination(dest, preferences, weights))
    .sort((a, b) => {
      // Slightly prefer fresh destinations the user hasn't already booked/saved when scores tie
      const aSeen = interactedIds.has(a.destination._id) ? 1 : 0;
      const bSeen = interactedIds.has(b.destination._id) ? 1 : 0;
      return b.matchScore - a.matchScore || aSeen - bSeen || b.destination.rating - a.destination.rating;
    });

  // Trending backed by recorded platform viewCount + rating (never fabricated crowd numbers)
  const trending = [...allTravels]
    .sort((a, b) => Number(b.viewCount || 0) - Number(a.viewCount || 0) || Number(b.rating || 0) - Number(a.rating || 0))
    .slice(0, 6)
    .map((d) => ({
      ...d,
      trendSignal:
        Number(d.viewCount || 0) > 0
          ? `${d.viewCount} recorded platform views`
          : `Top rated (${d.rating}★)`,
    }));

  return {
    algorithmType: "rule-based-weighted-scoring",
    algorithmLabel:
      "Transparent rule-based weighted scoring (Interest, Budget, Category, Season, Duration) — not an opaque ML model.",
    weights,
    personalized: Boolean(userId),
    preferences,
    recommendations: scored.slice(0, limit).map((s) => ({
      ...s.destination,
      matchScore: s.matchScore,
      reasons: s.reasons,
      scoreBreakdown: s.breakdown,
    })),
    trending,
  };
}

async function getSimilarDestinations(travelId, limit = 4) {
  const allTravels = await store.listAllActiveTravels();
  const target = allTravels.find((t) => t._id === travelId);
  if (!target) return [];

  const targetTerms = new Set(
    [...(target.highlights || []), ...(target.activities || []), target.region, target.country]
      .filter(Boolean)
      .map((s) => String(s).toLowerCase()),
  );

  return allTravels
    .filter((t) => t._id !== travelId)
    .map((cand) => {
      let score = 0;
      const reasons = [];
      if (cand.category === target.category) {
        score += 45;
        reasons.push(`Same ${cand.category} category`);
      }
      if (cand.region && target.region && cand.region === target.region) {
        score += 25;
        reasons.push(`Same region (${cand.region})`);
      } else if (cand.country === target.country) {
        score += 18;
        reasons.push(`Also in ${cand.country}`);
      }
      const priceDiff = Math.abs(Number(cand.pricePerNight) - Number(target.pricePerNight));
      if (priceDiff <= 45) {
        score += 20;
        reasons.push("Similar nightly budget estimate");
      }
      const candText = [...(cand.highlights || []), ...(cand.activities || [])].join(" ").toLowerCase();
      let sharedCount = 0;
      targetTerms.forEach((term) => {
        if (term.length > 3 && candText.includes(term)) sharedCount += 1;
      });
      if (sharedCount > 0) {
        score += Math.min(15, sharedCount * 5);
        reasons.push("Shared travel themes");
      }
      return { ...cand, similarityScore: Math.min(99, score), similarityReasons: reasons.slice(0, 2) };
    })
    .sort((a, b) => b.similarityScore - a.similarityScore || b.rating - a.rating)
    .slice(0, limit);
}

module.exports = {
  DEFAULT_WEIGHTS,
  normalizeWeights,
  getPersonalizedRecommendations,
  getSimilarDestinations,
};

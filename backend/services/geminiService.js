const { GoogleGenAI, Type } = require("@google/genai");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const store = require("./storeService");

const GEMINI_TIMEOUT_MS = 25000;

function setGeminiClientForTesting(mockClient) {
  if (env.isTest) {
    globalThis.__TRAVELOGIA_GEMINI_CLIENT__ = mockClient;
  }
}

function getGeminiClient() {
  if (env.isTest && globalThis.__TRAVELOGIA_GEMINI_CLIENT__) {
    return globalThis.__TRAVELOGIA_GEMINI_CLIENT__;
  }
  const apiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ApiError(
      503,
      "Travelogia AI is not configured on this server. Please configure GEMINI_API_KEY in Settings > Secrets.",
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function runGeminiCall(fn) {
  let timeoutHandle;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(
        new ApiError(
          504,
          "Travelogia AI took too long to respond. Please try again in a moment.",
        ),
      );
    }, GEMINI_TIMEOUT_MS);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const status = Number(err?.status || err?.statusCode || 502);
    if (status === 429) {
      throw new ApiError(
        429,
        "Travelogia AI is receiving high traffic right now. Please wait a moment and try again.",
      );
    }
    if (status === 401 || status === 403 || status === 400) {
      throw new ApiError(
        502,
        "Travelogia AI could not authenticate with Gemini. Please check your GEMINI_API_KEY in Settings > Secrets.",
      );
    }
    throw new ApiError(
      502,
      "Travelogia AI is temporarily unavailable. Please try again shortly.",
    );
  } finally {
    clearTimeout(timeoutHandle);
  }
}

function buildSystemInstruction(groundedDestinations) {
  const catalogueJson = groundedDestinations.map((d) => ({
    id: d._id,
    title: d.title,
    city: d.city,
    state: d.state || undefined,
    country: d.country,
    category: d.category,
    estimatedPricePerNightUSD: d.pricePerNight,
    approximateBudget: d.approximateBudget,
    bestTimeToVisit: d.bestTimeToVisit,
    estimatedDuration: d.estimatedDuration,
    highlights: d.highlights,
    travelTips: d.travelTips,
    url: `/travels/${d._id}`,
  }));

  return [
    "You are Travelogia AI, the helpful travel planning assistant for the Travelogia platform.",
    "STRICT GROUNDING & SAFETY RULES:",
    "1. Use the Travelogia Database Destinations provided below whenever recommending or comparing destinations that exist in our catalogue.",
    "2. Clearly distinguish between: (a) Travelogia catalogue listings (include their path like /travels/<id> and note that prices are estimates), (b) Approximate travel budget estimates, and (c) General AI travel advice.",
    "3. NEVER invent Travelogia database listings, fake verified prices, or real-time hotel/flight availability.",
    "4. If the user asks about a place NOT in the provided Travelogia database list, you may give helpful general travel guidance, while explicitly noting it is not currently listed in the Travelogia catalogue.",
    "5. NEVER confirm bookings, process payments, or guarantee availability. Direct users to the destination page (/travels/<id>) to use Travelogia's booking workflow.",
    "6. Keep answers well-structured, concise (under ~280 words unless an itinerary is requested), practical, and friendly.",
    "",
    "TRAVELOGIA DATABASE DESTINATIONS (Matched Context):",
    JSON.stringify(catalogueJson, null, 2),
  ].join("\n");
}

async function generateTravelReply({ message, conversationHistory = [] }) {
  const groundedDestinations = await store.searchDestinationsForChatbot(message, 8);
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const recentHistory = Array.isArray(conversationHistory)
    ? conversationHistory.slice(-8)
    : [];

  const contents = [
    ...recentHistory
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant" || m.role === "model") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0,
      )
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content.trim().slice(0, 1000) }],
      })),
    {
      role: "user",
      parts: [{ text: message.trim() }],
    },
  ];

  const systemInstruction = buildSystemInstruction(groundedDestinations);

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents,
      config: { systemInstruction },
    }),
  );

  const replyText = typeof response?.text === "string" ? response.text.trim() : "";
  if (!replyText) {
    throw new ApiError(
      502,
      "Travelogia AI returned an empty response. Please try rephrasing your question.",
    );
  }

  return {
    reply: replyText,
    suggestedDestinations: groundedDestinations.slice(0, 4).map((d) => ({
      _id: d._id,
      title: d.title,
      city: d.city,
      country: d.country,
      pricePerNight: d.pricePerNight,
      category: d.category,
      url: `/travels/${d._id}`,
    })),
  };
}

// Feature 1: Structured JSON Smart Trip Builder
async function generateStructuredItinerary({
  startingCity,
  destinationPreferences,
  startDate,
  days,
  travelers,
  totalBudget,
  currency,
  travelStyle,
  interests,
  preferredActivities,
  accommodationPreference,
  candidateDestinations,
}) {
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const catalogueSummary = candidateDestinations.slice(0, 14).map((d) => ({
    id: d._id,
    title: d.title,
    city: d.city,
    country: d.country,
    category: d.category,
    estimatedPricePerNightUSD: d.pricePerNight,
    highlights: d.highlights,
    activities: d.activities,
  }));

  const prompt = [
    `Create a ${days}-day ${travelStyle} itinerary starting from ${startingCity} for ${travelers} traveller(s).`,
    `Preferred destinations/regions: ${(destinationPreferences || []).join(", ") || "Best matches from catalogue"}.`,
    `Start date: ${startDate || "Flexible"}. Target budget: ${totalBudget} ${currency}.`,
    `Interests: ${(interests || []).join(", ") || "General sightseeing"}.`,
    `Preferred activities: ${(preferredActivities || []).join(", ") || "Balanced local experiences"}.`,
    `Accommodation preference: ${accommodationPreference || "Mid-range"}.`,
    `IMPORTANT: Only reference destinationId values from the provided Travelogia Catalogue JSON (or empty string if it is a transit day). Do NOT invent verified prices or flight schedules.`,
    `TRAVELOGIA CATALOGUE:`,
    JSON.stringify(catalogueSummary),
  ].join("\n");

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING },
      dayPlans: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            dayNumber: { type: Type.INTEGER },
            title: { type: Type.STRING },
            destinationId: { type: Type.STRING },
            destinationTitle: { type: Type.STRING },
            activities: { type: Type.ARRAY, items: { type: Type.STRING } },
            attractions: { type: Type.ARRAY, items: { type: Type.STRING } },
            accommodationArea: { type: Type.STRING },
            foodRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            alternativeActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
            travelTips: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["dayNumber", "title", "activities", "attractions"],
        },
      },
    },
    required: ["title", "dayPlans"],
  };

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          "You are Travelogia Smart Trip Planner. Return valid JSON matching the schema. Ground destinations strictly in the provided Travelogia catalogue IDs.",
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  );

  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  if (!raw) {
    throw new ApiError(502, "Travelogia AI returned an empty itinerary response.");
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ApiError(502, "Travelogia AI returned malformed itinerary JSON. Please retry.");
  }

  if (!parsed || !Array.isArray(parsed.dayPlans) || parsed.dayPlans.length === 0) {
    throw new ApiError(502, "Travelogia AI did not return day-by-day trip plans.");
  }

  return parsed;
}

// Feature 1: Regenerate a single day
async function regenerateItineraryDay({ itinerary, dayNumber, focusNote, candidateDestinations }) {
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const catalogueSummary = candidateDestinations.slice(0, 10).map((d) => ({
    id: d._id,
    title: d.title,
    city: d.city,
    country: d.country,
    highlights: d.highlights,
  }));

  const prompt = [
    `Regenerate ONLY Day ${dayNumber} of the itinerary "${itinerary.title}" (${itinerary.travelStyle}, starting from ${itinerary.startingCity}).`,
    focusNote ? `User preference for this day: ${focusNote}` : "Provide a fresh, distinct set of local activities and dining ideas.",
    `Existing day plans summary: ${JSON.stringify(
      (itinerary.dayPlans || []).map((d) => ({ day: d.dayNumber, title: d.title })),
    )}`,
    `TRAVELOGIA CATALOGUE: ${JSON.stringify(catalogueSummary)}`,
  ].join("\n");

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      dayNumber: { type: Type.INTEGER },
      title: { type: Type.STRING },
      destinationId: { type: Type.STRING },
      destinationTitle: { type: Type.STRING },
      activities: { type: Type.ARRAY, items: { type: Type.STRING } },
      attractions: { type: Type.ARRAY, items: { type: Type.STRING } },
      accommodationArea: { type: Type.STRING },
      foodRecommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
      alternativeActivities: { type: Type.ARRAY, items: { type: Type.STRING } },
      travelTips: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["dayNumber", "title", "activities", "attractions"],
  };

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents: prompt,
      config: {
        systemInstruction:
          "Return valid JSON for a single itinerary day grounded in the provided Travelogia catalogue.",
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  );

  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(502, "Travelogia AI returned malformed day JSON. Please retry.");
  }
}

// Feature 7: Grounded Destination Comparison AI Summary
async function generateComparisonSummary({ destinations, startingCity, preferences }) {
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const context = destinations.map((d) => ({
    title: d.title,
    city: d.city,
    region: d.region,
    country: d.country,
    category: d.category,
    estimatedPricePerNightUSD: d.pricePerNight,
    rating: d.rating,
    bestTimeToVisit: d.bestTimeToVisit,
    estimatedDuration: d.estimatedDuration,
    accessibility: d.accessibility,
    highlights: d.highlights,
  }));

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents: [
        `Compare these ${destinations.length} Travelogia destinations side-by-side:`,
        JSON.stringify(context, null, 2),
        startingCity ? `Starting city: ${startingCity}` : "",
        preferences ? `User priorities: ${preferences}` : "",
      ].join("\n"),
      config: {
        systemInstruction:
          "You are Travelogia AI. Compare ONLY the exact data provided. Do NOT invent prices, live availability, or ratings. Clearly highlight who each destination is best suited for, budget tradeoffs (noting prices are estimates), and accessibility differences in under 220 words.",
      },
    }),
  );

  const text = typeof response?.text === "string" ? response.text.trim() : "";
  if (!text) throw new ApiError(502, "Empty comparison summary returned by AI.");
  return text;
}

// Feature 6: Hidden Gems AI Suggestions
async function generateHiddenGemSuggestions({ gems, interests, season, budget }) {
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const context = gems.slice(0, 10).map((g) => ({
    id: g._id,
    title: g.title,
    city: g.city,
    region: g.region,
    state: g.state,
    country: g.country,
    estimatedPricePerNightUSD: g.pricePerNight,
    bestTimeToVisit: g.bestTimeToVisit,
    highlights: g.highlights,
  }));

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents: [
        `Recommend the top 3 offbeat hidden gems from this Travelogia list for interests: ${interests || "nature & culture"}, season: ${season || "any"}, max budget/night: ${budget || "flexible"}.`,
        JSON.stringify(context),
      ].join("\n"),
      config: {
        systemInstruction:
          "You are Travelogia Hidden Gems Guide. Recommend ONLY from the provided destinations, never fabricate visitor counts or crowd statistics, and note prices are planning estimates. Keep response concise (under 220 words).",
      },
    }),
  );

  const text = typeof response?.text === "string" ? response.text.trim() : "";
  if (!text) throw new ApiError(502, "Empty hidden gem suggestions returned by AI.");
  return text;
}

// Feature 10: Smart Packing Assistant AI Suggestions
async function generatePackingAiSuggestions({ destinationName, duration, season, activities, travellerType }) {
  const client = getGeminiClient();
  const model = process.env.GEMINI_MODEL || env.GEMINI_MODEL || "gemini-4-hydrogen";

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      tips: { type: Type.ARRAY, items: { type: Type.STRING } },
      extraItems: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            category: { type: Type.STRING },
            name: { type: Type.STRING },
            quantity: { type: Type.INTEGER },
          },
          required: ["category", "name"],
        },
      },
    },
    required: ["tips", "extraItems"],
  };

  const response = await runGeminiCall(() =>
    client.models.generateContent({
      model,
      contents: `Suggest smart packing additions and practical tips for ${destinationName} (${duration} days, season: ${season}, traveller: ${travellerType}, activities: ${(activities || []).join(", ") || "sightseeing"}). Category must be one of: Clothing, Toiletries, Documents, Electronics, Medicines & Essentials, Activity Gear, Optional. Never provide medical prescriptions or clinical medical advice.`,
      config: {
        systemInstruction:
          "Return valid JSON with practical non-medical packing suggestions and concise tips.",
        responseMimeType: "application/json",
        responseSchema,
      },
    }),
  );

  const raw = typeof response?.text === "string" ? response.text.trim() : "";
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError(502, "Malformed packing suggestions returned by AI.");
  }
}

module.exports = {
  generateTravelReply,
  generateStructuredItinerary,
  regenerateItineraryDay,
  generateComparisonSummary,
  generateHiddenGemSuggestions,
  generatePackingAiSuggestions,
  setGeminiClientForTesting,
};

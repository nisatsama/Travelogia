const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const geminiService = require("../services/geminiService");
const readinessService = require("../services/readinessService");

const VALID_CATEGORIES = [
  "Clothing",
  "Toiletries",
  "Documents",
  "Electronics",
  "Medicines & Essentials",
  "Activity Gear",
  "Optional",
];

function buildDeterministicPackingItems({
  duration = 4,
  season = "Spring",
  category = "Nature",
  activities = [],
  travellerType = "solo",
  permitRequired = false,
  weatherSummary = null,
}) {
  const days = Math.min(30, Math.max(1, Number(duration) || 4));
  const clothingSets = Math.min(10, Math.max(2, days));
  const items = [];
  const add = (cat, name, quantity = 1) => {
    items.push({
      id: v2Store.createId("pitem"),
      category: cat,
      name,
      quantity,
      checked: false,
      custom: false,
    });
  };

  // 1. Clothing
  add("Clothing", "Breathable tops / shirts", clothingSets);
  add("Clothing", "Bottoms / comfortable trousers", Math.max(2, Math.ceil(clothingSets / 2)));
  add("Clothing", "Undergarments & socks", clothingSets + 1);
  add("Clothing", "Sleepwear", 1);
  add("Clothing", "Comfortable walking shoes", 1);

  const sLow = String(season || "").toLowerCase();
  const coldWeather =
    sLow.includes("winter") ||
    category === "Mountain" ||
    (weatherSummary?.available && Number(weatherSummary.temperatureC) < 14);
  const rainyWeather =
    sLow.includes("monsoon") ||
    (weatherSummary?.available && Number(weatherSummary.precipProbabilityPct || 0) >= 45);

  if (coldWeather) {
    add("Clothing", "Insulated jacket / fleece layer", 1);
    add("Clothing", "Thermal innerwear", 2);
    add("Clothing", "Warm beanie & gloves", 1);
  }
  if (rainyWeather) {
    add("Clothing", "Waterproof rain jacket / poncho", 1);
    add("Clothing", "Quick-dry spare socks", 2);
  }
  if (category === "Beach" || sLow.includes("summer")) {
    add("Clothing", "Swimwear & light linen cover-up", 1);
    add("Clothing", "Sun hat & UV sunglasses", 1);
    add("Clothing", "Flip-flops / beach sandals", 1);
  }

  // 2. Toiletries
  add("Toiletries", "Toothbrush & toothpaste", 1);
  add("Toiletries", "Biodegradable soap / face wash", 1);
  add("Toiletries", "Sunscreen (SPF 30+)", 1);
  add("Toiletries", "Lip balm & moisturizer", 1);
  add("Toiletries", "Hand sanitizer & wet wipes", 1);

  // 3. Documents
  add("Documents", "Government photo ID / Passport", 1);
  add("Documents", "Digital & printed booking confirmations", 1);
  add("Documents", "Emergency contacts card (offline copy)", 1);
  add("Documents", "Payment cards + local emergency cash", 1);
  if (permitRequired) {
    add("Documents", "Regional travel permit (ILP / PAP / local pass) + extra passport photos", 1);
  }

  // 4. Electronics
  add("Electronics", "Smartphone & charging cable", 1);
  add("Electronics", "Power bank (10,000+ mAh)", 1);
  add("Electronics", "Universal travel power adapter", 1);
  add("Electronics", "Earphones / headphones", 1);

  // 5. Medicines & Essentials (strictly general non-medical items)
  add("Medicines & Essentials", "Personal prescription medications (consult your doctor)", 1);
  add("Medicines & Essentials", "Basic bandage & antiseptic wipes kit", 1);
  add("Medicines & Essentials", "Reusable water bottle", 1);
  add("Medicines & Essentials", "Insect repellent", 1);

  // 6. Activity Gear
  const actText = activities.join(" ").toLowerCase();
  if (actText.includes("trek") || actText.includes("hik") || category === "Mountain" || category === "Adventure") {
    add("Activity Gear", "Daypack (20–30L) with rain cover", 1);
    add("Activity Gear", "Sturdy trekking shoes with ankle grip", 1);
    add("Activity Gear", "Headlamp or compact flashlight", 1);
  } else {
    add("Activity Gear", "Compact day bag / crossbody pouch", 1);
  }
  if (actText.includes("photo") || actText.includes("sightseeing")) {
    add("Activity Gear", "Camera / spare memory cards", 1);
  }
  if (actText.includes("swim") || actText.includes("snorkel") || category === "Beach") {
    add("Activity Gear", "Waterproof dry pouch for phone", 1);
    add("Activity Gear", "Quick-dry microfiber towel", 1);
  }

  // 7. Optional & Traveller-specific
  add("Optional", "Travel pillow & eye mask", 1);
  add("Optional", "Foldable laundry bag", 1);
  add("Optional", "Compact travel umbrella", 1);

  const tLow = String(travellerType || "").toLowerCase();
  if (tLow === "family") {
    add("Optional", "Family snacks & kid-friendly entertainment pack", 1);
    add("Documents", "Family ID copies for all travellers", 1);
  } else if (tLow === "backpacker") {
    add("Activity Gear", "Packing cubes & luggage padlock", 1);
  }

  return items;
}

exports.generatePackingPlan = asyncHandler(async (req, res) => {
  const {
    travelId = "",
    destinationName = "",
    duration = 4,
    season = "Spring",
    activities = [],
    travellerType = "solo",
    includeAi = false,
  } = req.body || {};

  let travel = null;
  if (travelId) {
    travel = await store.findTravelById(String(travelId).trim()).catch(() => null);
  }

  const resolvedName = travel
    ? `${travel.title} (${travel.city}, ${travel.country})`
    : String(destinationName || "").trim();

  if (!resolvedName) {
    throw new ApiError(400, "Select a destination or enter a destination name.");
  }

  const weatherSummary =
    travel?.coordinates && Number.isFinite(travel.coordinates.latitude)
      ? await readinessService.fetchOpenMeteoWeather(
          travel.coordinates.latitude,
          travel.coordinates.longitude,
        )
      : null;

  const actList = Array.isArray(activities)
    ? activities.map((a) => String(a).trim()).filter(Boolean)
    : typeof activities === "string"
      ? activities.split(",").map((a) => a.trim()).filter(Boolean)
      : [];

  const items = buildDeterministicPackingItems({
    duration,
    season,
    category: travel?.category || "Nature",
    activities: actList,
    travellerType,
    permitRequired: Boolean(travel?.readinessInfo?.permitRequired),
    weatherSummary,
  });

  let aiTips = [];
  if (includeAi) {
    const aiResp = await geminiService.generatePackingAiSuggestions({
      destinationName: resolvedName,
      duration: Number(duration) || 4,
      season,
      activities: actList,
      travellerType,
    });
    aiTips = Array.isArray(aiResp.tips) ? aiResp.tips.slice(0, 6) : [];
    const extra = Array.isArray(aiResp.extraItems) ? aiResp.extraItems : [];
    extra.slice(0, 6).forEach((ei) => {
      const cat = VALID_CATEGORIES.includes(ei.category) ? ei.category : "Optional";
      if (ei.name && !items.some((i) => i.name.toLowerCase() === String(ei.name).toLowerCase())) {
        items.push({
          id: v2Store.createId("pitem"),
          category: cat,
          name: String(ei.name).trim().slice(0, 120),
          quantity: Math.max(1, Number(ei.quantity) || 1),
          checked: false,
          custom: false,
        });
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      title: `${resolvedName} — ${duration}-Day Packing List`,
      destinationName: resolvedName,
      travelId: travel ? travel._id : "",
      duration: Number(duration) || 4,
      season,
      travellerType,
      activities: actList,
      weatherContext: weatherSummary,
      items,
      aiTips,
      disclaimer:
        "Packing suggestions are general travel preparation reminders and do not constitute medical advice. Always consult a healthcare professional for personal health or prescription needs.",
    },
  });
});

exports.listMyPackingLists = asyncHandler(async (req, res) => {
  const lists = await v2Store.listUserPackingLists(req.user.id);
  res.status(200).json({ success: true, data: lists });
});

exports.savePackingList = asyncHandler(async (req, res) => {
  const {
    title,
    destinationName = "",
    travelId = "",
    duration = 4,
    season = "Spring",
    travellerType = "solo",
    activities = [],
    isTemplate = false,
    items = [],
    aiTips = [],
  } = req.body || {};

  if (!title || String(title).trim().length < 2) {
    throw new ApiError(400, "Packing list title is required.");
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Packing list must contain at least one item.");
  }

  const sanitizedItems = items.slice(0, 120).map((it) => ({
    id: String(it.id || v2Store.createId("pitem")),
    category: VALID_CATEGORIES.includes(it.category) ? it.category : "Optional",
    name: String(it.name || "Item").trim().slice(0, 120),
    quantity: Math.max(1, Math.min(50, Number(it.quantity) || 1)),
    checked: Boolean(it.checked),
    custom: Boolean(it.custom),
  }));

  const created = await v2Store.createPackingList({
    user: req.user.id,
    title: String(title).trim().slice(0, 140),
    destinationName: String(destinationName || "").trim().slice(0, 140),
    travelId: String(travelId || ""),
    duration: Math.max(1, Number(duration) || 4),
    season: String(season || "Spring"),
    travellerType: String(travellerType || "solo"),
    activities: Array.isArray(activities) ? activities.map(String).slice(0, 10) : [],
    isTemplate: Boolean(isTemplate),
    items: sanitizedItems,
    aiTips: Array.isArray(aiTips) ? aiTips.map(String).slice(0, 8) : [],
  });

  res.status(201).json({ success: true, data: created });
});

exports.updatePackingList = asyncHandler(async (req, res) => {
  const existing = await v2Store.findPackingListById(req.params.id);
  if (!existing) throw new ApiError(404, "Packing list not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to update this packing list.");
  }

  const updates = {};
  if (typeof req.body?.title === "string" && req.body.title.trim()) {
    updates.title = req.body.title.trim().slice(0, 140);
  }
  if (typeof req.body?.isTemplate === "boolean") {
    updates.isTemplate = req.body.isTemplate;
  }
  if (Array.isArray(req.body?.items)) {
    updates.items = req.body.items.slice(0, 120).map((it) => ({
      id: String(it.id || v2Store.createId("pitem")),
      category: VALID_CATEGORIES.includes(it.category) ? it.category : "Optional",
      name: String(it.name || "Item").trim().slice(0, 120),
      quantity: Math.max(1, Math.min(50, Number(it.quantity) || 1)),
      checked: Boolean(it.checked),
      custom: Boolean(it.custom),
    }));
  }

  const updated = await v2Store.updatePackingList(existing._id, updates);
  res.status(200).json({ success: true, data: updated });
});

exports.deletePackingList = asyncHandler(async (req, res) => {
  const existing = await v2Store.findPackingListById(req.params.id);
  if (!existing) throw new ApiError(404, "Packing list not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to delete this packing list.");
  }
  await v2Store.deletePackingList(existing._id);
  res.status(200).json({ success: true, message: "Packing list deleted." });
});

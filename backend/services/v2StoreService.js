const crypto = require("crypto");
const { isDbConnected } = require("../config/database");
const Itinerary = require("../models/Itinerary");
const BudgetPlan = require("../models/BudgetPlan");
const CollabTrip = require("../models/CollabTrip");
const TravelJournal = require("../models/TravelJournal");
const PackingList = require("../models/PackingList");
const { PriceObservation, PriceAlert, Notification } = require("../models/PriceWatch");
const UserPreference = require("../models/UserPreference");
const destinationsSeed = require("../data/destinationsData");

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function createInitialBaselinePriceObservations() {
  // Clearly labelled baseline catalogue estimates across 6 historical monthly checkpoints
  const observations = [];
  const multipliers = [0.94, 0.98, 1.05, 1.02, 0.96, 1.0];
  const now = Date.now();
  destinationsSeed.slice(0, 82).forEach((dest) => {
    multipliers.forEach((mult, idx) => {
      const daysAgo = (multipliers.length - 1 - idx) * 30;
      observations.push({
        _id: createId("pobs"),
        travelId: dest._id,
        destinationTitle: dest.title,
        estimatedPricePerNight: Math.max(10, Math.round(dest.pricePerNight * mult)),
        currency: dest.currency || "USD",
        source: "catalogue-estimate",
        note: "Historical baseline estimate from Travelogia catalogue",
        recordedBy: "system",
        observedAt: new Date(now - daysAgo * 86400000).toISOString(),
        createdAt: new Date(now - daysAgo * 86400000).toISOString(),
      });
    });
  });
  return observations;
}

function createInitialMemory() {
  return {
    itineraries: [],
    budgets: [],
    trips: [],
    journals: [],
    packingLists: [],
    priceObservations: createInitialBaselinePriceObservations(),
    priceAlerts: [],
    notifications: [],
    preferences: new Map(),
  };
}

let mem = createInitialMemory();

function resetV2MemoryStore() {
  mem = createInitialMemory();
}

// ============================
// ITINERARIES (Feature 1)
// ============================
async function createItinerary(data) {
  if (isDbConnected()) {
    const doc = await Itinerary.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("itin"), ...data, createdAt: now, updatedAt: now };
  mem.itineraries.unshift(item);
  return { ...item };
}

async function listUserItineraries(userId) {
  if (isDbConnected()) {
    return Itinerary.find({ user: userId }).sort({ createdAt: -1 }).lean();
  }
  return mem.itineraries.filter((i) => String(i.user) === String(userId)).map((i) => ({ ...i }));
}

async function findItineraryById(id) {
  if (isDbConnected()) {
    return Itinerary.findById(id).lean();
  }
  const found = mem.itineraries.find((i) => i._id === id);
  return found ? { ...found } : null;
}

async function updateItinerary(id, updates) {
  if (isDbConnected()) {
    return Itinerary.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  }
  const idx = mem.itineraries.findIndex((i) => i._id === id);
  if (idx === -1) return null;
  mem.itineraries[idx] = { ...mem.itineraries[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.itineraries[idx] };
}

async function deleteItinerary(id) {
  if (isDbConnected()) {
    await Itinerary.findByIdAndDelete(id);
    return true;
  }
  mem.itineraries = mem.itineraries.filter((i) => i._id !== id);
  return true;
}

// ============================
// BUDGET PLANS (Feature 2)
// ============================
async function createBudgetPlan(data) {
  if (isDbConnected()) {
    const doc = await BudgetPlan.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("bud"), ...data, createdAt: now, updatedAt: now };
  mem.budgets.unshift(item);
  return { ...item };
}

async function listUserBudgets(userId) {
  if (isDbConnected()) {
    return BudgetPlan.find({ user: userId }).sort({ createdAt: -1 }).lean();
  }
  return mem.budgets.filter((b) => String(b.user) === String(userId)).map((b) => ({ ...b }));
}

async function findBudgetById(id) {
  if (isDbConnected()) {
    return BudgetPlan.findById(id).lean();
  }
  const found = mem.budgets.find((b) => b._id === id);
  return found ? { ...found } : null;
}

async function updateBudgetPlan(id, updates) {
  if (isDbConnected()) {
    return BudgetPlan.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  }
  const idx = mem.budgets.findIndex((b) => b._id === id);
  if (idx === -1) return null;
  mem.budgets[idx] = { ...mem.budgets[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.budgets[idx] };
}

async function deleteBudgetPlan(id) {
  if (isDbConnected()) {
    await BudgetPlan.findByIdAndDelete(id);
    return true;
  }
  mem.budgets = mem.budgets.filter((b) => b._id !== id);
  return true;
}

// ============================
// COLLABORATIVE TRIPS (Feature 3)
// ============================
async function createCollabTrip(data) {
  if (isDbConnected()) {
    const doc = await CollabTrip.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = {
    _id: createId("trip"),
    destinations: [],
    activities: [],
    comments: [],
    expenses: [],
    version: 1,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  mem.trips.unshift(item);
  return { ...item };
}

async function listUserCollabTrips(userId) {
  if (isDbConnected()) {
    return CollabTrip.find({ "members.user": String(userId) }).sort({ updatedAt: -1 }).lean();
  }
  return mem.trips
    .filter((t) => (t.members || []).some((m) => String(m.user) === String(userId)))
    .map((t) => ({ ...t }));
}

async function findCollabTripById(id) {
  if (isDbConnected()) {
    return CollabTrip.findById(id).lean();
  }
  const found = mem.trips.find((t) => t._id === id);
  return found ? { ...found } : null;
}

async function findCollabTripByInviteCode(code) {
  const normalized = String(code || "").trim().toUpperCase();
  if (isDbConnected()) {
    return CollabTrip.findOne({ inviteCode: normalized }).lean();
  }
  const found = mem.trips.find((t) => t.inviteCode === normalized);
  return found ? { ...found } : null;
}

async function saveCollabTrip(id, nextState) {
  const nextVersion = (nextState.version || 1) + 1;
  if (isDbConnected()) {
    const { _id, ...rest } = nextState;
    return CollabTrip.findByIdAndUpdate(
      id,
      { $set: { ...rest, version: nextVersion } },
      { new: true },
    ).lean();
  }
  const idx = mem.trips.findIndex((t) => t._id === id);
  if (idx === -1) return null;
  mem.trips[idx] = {
    ...nextState,
    _id: id,
    version: nextVersion,
    updatedAt: new Date().toISOString(),
  };
  return { ...mem.trips[idx] };
}

// ============================
// TRAVEL JOURNALS (Feature 9)
// ============================
async function createJournal(data) {
  if (isDbConnected()) {
    const doc = await TravelJournal.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("jrn"), ...data, createdAt: now, updatedAt: now };
  mem.journals.unshift(item);
  return { ...item };
}

async function listPublicJournals() {
  if (isDbConnected()) {
    return TravelJournal.find({ isPublic: true }).sort({ createdAt: -1 }).limit(50).lean();
  }
  return mem.journals.filter((j) => j.isPublic).map((j) => ({ ...j }));
}

async function listUserJournals(userId) {
  if (isDbConnected()) {
    return TravelJournal.find({ user: String(userId) }).sort({ visitDate: -1, createdAt: -1 }).lean();
  }
  return mem.journals.filter((j) => String(j.user) === String(userId)).map((j) => ({ ...j }));
}

async function findJournalById(id) {
  if (isDbConnected()) {
    return TravelJournal.findById(id).lean();
  }
  const found = mem.journals.find((j) => j._id === id);
  return found ? { ...found } : null;
}

async function updateJournal(id, updates) {
  if (isDbConnected()) {
    return TravelJournal.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  }
  const idx = mem.journals.findIndex((j) => j._id === id);
  if (idx === -1) return null;
  mem.journals[idx] = { ...mem.journals[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.journals[idx] };
}

async function deleteJournal(id) {
  if (isDbConnected()) {
    await TravelJournal.findByIdAndDelete(id);
    return true;
  }
  mem.journals = mem.journals.filter((j) => j._id !== id);
  return true;
}

// ============================
// PACKING LISTS (Feature 10)
// ============================
async function createPackingList(data) {
  if (isDbConnected()) {
    const doc = await PackingList.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("pack"), ...data, createdAt: now, updatedAt: now };
  mem.packingLists.unshift(item);
  return { ...item };
}

async function listUserPackingLists(userId) {
  if (isDbConnected()) {
    return PackingList.find({ user: String(userId) }).sort({ updatedAt: -1 }).lean();
  }
  return mem.packingLists.filter((p) => String(p.user) === String(userId)).map((p) => ({ ...p }));
}

async function findPackingListById(id) {
  if (isDbConnected()) {
    return PackingList.findById(id).lean();
  }
  const found = mem.packingLists.find((p) => p._id === id);
  return found ? { ...found } : null;
}

async function updatePackingList(id, updates) {
  if (isDbConnected()) {
    return PackingList.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  }
  const idx = mem.packingLists.findIndex((p) => p._id === id);
  if (idx === -1) return null;
  mem.packingLists[idx] = { ...mem.packingLists[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.packingLists[idx] };
}

async function deletePackingList(id) {
  if (isDbConnected()) {
    await PackingList.findByIdAndDelete(id);
    return true;
  }
  mem.packingLists = mem.packingLists.filter((p) => p._id !== id);
  return true;
}

// ============================
// PRICE WATCHER & NOTIFICATIONS (Feature 11)
// ============================
async function listPriceObservations(travelId) {
  if (isDbConnected()) {
    const rows = await PriceObservation.find({ travelId }).sort({ observedAt: 1 }).limit(60).lean();
    if (rows.length > 0) return rows;
    // Fallback to baseline observations if MongoDB collection has none yet
    return mem.priceObservations.filter((o) => o.travelId === travelId);
  }
  return mem.priceObservations
    .filter((o) => o.travelId === travelId)
    .sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt))
    .map((o) => ({ ...o }));
}

async function addPriceObservation(data) {
  if (isDbConnected()) {
    const doc = await PriceObservation.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = {
    _id: createId("pobs"),
    observedAt: now,
    ...data,
    createdAt: now,
  };
  mem.priceObservations.push(item);
  return { ...item };
}

async function createPriceAlert(data) {
  if (isDbConnected()) {
    const doc = await PriceAlert.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = {
    _id: createId("palert"),
    active: true,
    lastTriggeredAt: null,
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  mem.priceAlerts.unshift(item);
  return { ...item };
}

async function listUserPriceAlerts(userId) {
  if (isDbConnected()) {
    return PriceAlert.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.priceAlerts.filter((a) => String(a.user) === String(userId)).map((a) => ({ ...a }));
}

async function listAllActivePriceAlerts() {
  if (isDbConnected()) {
    return PriceAlert.find({ active: true }).lean();
  }
  return mem.priceAlerts.filter((a) => a.active).map((a) => ({ ...a }));
}

async function updatePriceAlert(id, updates) {
  if (isDbConnected()) {
    return PriceAlert.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean();
  }
  const idx = mem.priceAlerts.findIndex((a) => a._id === id);
  if (idx === -1) return null;
  mem.priceAlerts[idx] = { ...mem.priceAlerts[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.priceAlerts[idx] };
}

async function deletePriceAlert(id, userId) {
  if (isDbConnected()) {
    const res = await PriceAlert.findOneAndDelete({ _id: id, user: String(userId) });
    return Boolean(res);
  }
  const before = mem.priceAlerts.length;
  mem.priceAlerts = mem.priceAlerts.filter(
    (a) => !(a._id === id && String(a.user) === String(userId)),
  );
  return mem.priceAlerts.length < before;
}

async function createNotification(data) {
  if (isDbConnected()) {
    const doc = await Notification.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("notif"), read: false, ...data, createdAt: now };
  mem.notifications.unshift(item);
  return { ...item };
}

async function listUserNotifications(userId) {
  if (isDbConnected()) {
    return Notification.find({ user: String(userId) }).sort({ createdAt: -1 }).limit(40).lean();
  }
  return mem.notifications
    .filter((n) => String(n.user) === String(userId))
    .slice(0, 40)
    .map((n) => ({ ...n }));
}

async function markNotificationRead(id, userId) {
  if (isDbConnected()) {
    return Notification.findOneAndUpdate(
      { _id: id, user: String(userId) },
      { $set: { read: true } },
      { new: true },
    ).lean();
  }
  const idx = mem.notifications.findIndex(
    (n) => n._id === id && String(n.user) === String(userId),
  );
  if (idx === -1) return null;
  mem.notifications[idx].read = true;
  return { ...mem.notifications[idx] };
}

// ============================
// USER PREFERENCES (Feature 8)
// ============================
const DEFAULT_PREFS = {
  preferredCategories: [],
  interests: [],
  minBudgetPerNight: 20,
  maxBudgetPerNight: 300,
  preferredDurationDays: 4,
  preferredSeason: "",
  viewedDestinationIds: [],
  weights: {
    interest: 0.3,
    budget: 0.25,
    category: 0.2,
    season: 0.15,
    duration: 0.1,
  },
};

async function getUserPreference(userId) {
  if (isDbConnected()) {
    const doc = await UserPreference.findOne({ user: String(userId) }).lean();
    return doc || { user: String(userId), ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights } };
  }
  const existing = mem.preferences.get(String(userId));
  return existing
    ? { ...existing, weights: { ...(existing.weights || DEFAULT_PREFS.weights) } }
    : { user: String(userId), ...DEFAULT_PREFS, weights: { ...DEFAULT_PREFS.weights } };
}

async function upsertUserPreference(userId, updates) {
  const current = await getUserPreference(userId);
  const next = {
    ...current,
    ...updates,
    user: String(userId),
    weights: {
      ...DEFAULT_PREFS.weights,
      ...(current.weights || {}),
      ...(updates.weights || {}),
    },
  };
  if (isDbConnected()) {
    return UserPreference.findOneAndUpdate(
      { user: String(userId) },
      { $set: next },
      { upsert: true, new: true },
    ).lean();
  }
  mem.preferences.set(String(userId), next);
  return { ...next };
}

async function resetUserPreference(userId) {
  const fresh = {
    user: String(userId),
    ...DEFAULT_PREFS,
    weights: { ...DEFAULT_PREFS.weights },
  };
  if (isDbConnected()) {
    return UserPreference.findOneAndUpdate(
      { user: String(userId) },
      { $set: fresh },
      { upsert: true, new: true },
    ).lean();
  }
  mem.preferences.set(String(userId), fresh);
  return { ...fresh };
}

module.exports = {
  createId,
  resetV2MemoryStore,
  createItinerary,
  listUserItineraries,
  findItineraryById,
  updateItinerary,
  deleteItinerary,
  createBudgetPlan,
  listUserBudgets,
  findBudgetById,
  updateBudgetPlan,
  deleteBudgetPlan,
  createCollabTrip,
  listUserCollabTrips,
  findCollabTripById,
  findCollabTripByInviteCode,
  saveCollabTrip,
  createJournal,
  listPublicJournals,
  listUserJournals,
  findJournalById,
  updateJournal,
  deleteJournal,
  createPackingList,
  listUserPackingLists,
  findPackingListById,
  updatePackingList,
  deletePackingList,
  listPriceObservations,
  addPriceObservation,
  createPriceAlert,
  listUserPriceAlerts,
  listAllActivePriceAlerts,
  updatePriceAlert,
  deletePriceAlert,
  createNotification,
  listUserNotifications,
  markNotificationRead,
  getUserPreference,
  upsertUserPreference,
  resetUserPreference,
};

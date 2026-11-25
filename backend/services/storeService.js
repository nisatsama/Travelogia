const crypto = require("crypto");
const { isDbConnected } = require("../config/database");
const User = require("../models/User");
const Travel = require("../models/Travel");
const Booking = require("../models/Booking");
const Favourite = require("../models/Favourite");
const Package = require("../models/Package");
const destinationsSeed = require("../data/destinationsData");
const packagesSeed = require("../data/packageData");
const { escapeRegex, isValidEntityId, slugify } = require("../utils/sanitize");
const ApiError = require("../utils/ApiError");

// In-memory store used automatically when MongoDB is unavailable (e.g., preview or isolated tests)
function createInitialMemoryState() {
  return {
    travels: destinationsSeed.map((item) => ({ ...item })),
    packages: packagesSeed.map((item) => ({ ...item })),
    users: [],
    bookings: [],
    favorites: [],
  };
}

let memory = createInitialMemoryState();

function resetMemoryStore() {
  memory = createInitialMemoryState();
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(8).toString("hex")}`;
}

function stripPassword(userDoc) {
  if (!userDoc) return null;
  const obj = typeof userDoc.toObject === "function" ? userDoc.toObject() : { ...userDoc };
  delete obj.password;
  return obj;
}

// ============================
// USERS
// ============================

async function countAdmins() {
  if (isDbConnected()) {
    return User.countDocuments({ role: "admin" });
  }
  return memory.users.filter((u) => u.role === "admin").length;
}

async function findUserByEmail(email, { includePassword = false } = {}) {
  const normalized = String(email || "").trim().toLowerCase();
  if (isDbConnected()) {
    const query = User.findOne({ email: normalized });
    if (includePassword) query.select("+password");
    return query.lean();
  }
  const user = memory.users.find((u) => u.email === normalized) || null;
  if (!user) return null;
  return includePassword ? { ...user } : stripPassword(user);
}

async function findUserById(id, { includePassword = false } = {}) {
  if (!isValidEntityId(id, isDbConnected())) return null;
  if (isDbConnected()) {
    const query = User.findById(id);
    if (includePassword) query.select("+password");
    return query.lean();
  }
  const user = memory.users.find((u) => u._id === id) || null;
  if (!user) return null;
  return includePassword ? { ...user } : stripPassword(user);
}

async function createUser({ username, email, password, role = "user" }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  if (isDbConnected()) {
    const user = await User.create({
      username,
      email: normalizedEmail,
      password,
      role,
    });
    return stripPassword(user);
  }
  const exists = memory.users.find((u) => u.email === normalizedEmail);
  if (exists) {
    throw new ApiError(409, "An account with this email already exists.");
  }
  const now = new Date().toISOString();
  const user = {
    _id: createId("user"),
    username,
    email: normalizedEmail,
    password,
    role,
    bio: "",
    phone: "",
    location: "",
    memberSince: now,
    createdAt: now,
    updatedAt: now,
  };
  memory.users.push(user);
  return stripPassword(user);
}

async function updateUserProfile(id, updates) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid user ID.");
  }
  // Strict field allowlist — role and password can NEVER be updated here
  const safeUpdates = {};
  if (updates.username !== undefined) safeUpdates.username = updates.username;
  if (updates.bio !== undefined) safeUpdates.bio = updates.bio;
  if (updates.phone !== undefined) safeUpdates.phone = updates.phone;
  if (updates.location !== undefined) safeUpdates.location = updates.location;

  if (isDbConnected()) {
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: safeUpdates },
      { new: true, runValidators: true },
    )
      .select("-password")
      .lean();
    if (!updated) throw new ApiError(404, "User not found.");
    return updated;
  }

  const idx = memory.users.findIndex((u) => u._id === id);
  if (idx === -1) throw new ApiError(404, "User not found.");
  memory.users[idx] = {
    ...memory.users[idx],
    ...safeUpdates,
    updatedAt: new Date().toISOString(),
  };
  return stripPassword(memory.users[idx]);
}

async function updateUserRole(id, role) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid user ID.");
  }
  if (!["user", "admin"].includes(role)) {
    throw new ApiError(400, "Invalid role.");
  }
  if (isDbConnected()) {
    const updated = await User.findByIdAndUpdate(
      id,
      { $set: { role } },
      { new: true, runValidators: true },
    )
      .select("-password")
      .lean();
    if (!updated) throw new ApiError(404, "User not found.");
    return updated;
  }
  const idx = memory.users.findIndex((u) => u._id === id);
  if (idx === -1) throw new ApiError(404, "User not found.");
  memory.users[idx] = {
    ...memory.users[idx],
    role,
    updatedAt: new Date().toISOString(),
  };
  return stripPassword(memory.users[idx]);
}

async function listUsers({ skip = 0, limit = 20 } = {}) {
  if (isDbConnected()) {
    const [items, total] = await Promise.all([
      User.find({}).select("-password").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      User.countDocuments({}),
    ]);
    return { items, total };
  }
  const sorted = [...memory.users].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
  return {
    items: sorted.slice(skip, skip + limit).map(stripPassword),
    total: sorted.length,
  };
}

// ============================
// TRAVELS / DESTINATIONS
// ============================

const ALLOWED_SORT_FIELDS = new Set([
  "pricePerNight",
  "rating",
  "title",
  "createdAt",
  "country",
]);

async function listTravels({
  skip = 0,
  limit = 12,
  search = "",
  category = "",
  country = "",
  region = "",
  minPrice,
  maxPrice,
  minRating,
  featured,
  isHiddenGem,
  wheelchairAccessible,
  accessibleAccommodation,
  publicTransport,
  familyFriendly,
  accessibleAttractions,
  walkingIntensity,
  includeArchived = false,
  includeUnavailable = false,
  sortBy = "createdAt",
  sortOrder = "desc",
} = {}) {
  const safeSortBy = ALLOWED_SORT_FIELDS.has(sortBy) ? sortBy : "createdAt";
  const direction = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;

  if (isDbConnected()) {
    const filter = {};
    if (!includeArchived) filter.isArchived = { $ne: true };
    if (!includeUnavailable) filter.isAvailable = { $ne: false };
    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, "i");
    if (country) filter.country = new RegExp(`^${escapeRegex(country)}$`, "i");
    if (region) filter.region = new RegExp(`^${escapeRegex(region)}$`, "i");
    if (featured === true) filter.featured = true;
    if (isHiddenGem === true) filter.isHiddenGem = true;

    // 3-state accessibility filters — never treat "unknown" as "yes"
    if (wheelchairAccessible) filter["accessibility.wheelchairAccessible"] = wheelchairAccessible;
    if (accessibleAccommodation) filter["accessibility.accessibleAccommodation"] = accessibleAccommodation;
    if (publicTransport) filter["accessibility.publicTransport"] = publicTransport;
    if (familyFriendly) filter["accessibility.familyFriendly"] = familyFriendly;
    if (accessibleAttractions) filter["accessibility.accessibleAttractions"] = accessibleAttractions;
    if (walkingIntensity) filter["accessibility.walkingIntensity"] = walkingIntensity;

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.pricePerNight = {};
      if (minPrice !== undefined) filter.pricePerNight.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.pricePerNight.$lte = Number(maxPrice);
    }

    if (minRating !== undefined) {
      filter.rating = { $gte: Number(minRating) };
    }

    if (search) {
      const rx = new RegExp(escapeRegex(search), "i");
      filter.$or = [
        { title: rx },
        { city: rx },
        { country: rx },
        { state: rx },
        { region: rx },
        { location: rx },
        { description: rx },
        { category: rx },
      ];
    }

    const [items, total] = await Promise.all([
      Travel.find(filter)
        .sort({ [safeSortBy]: direction })
        .skip(skip)
        .limit(limit)
        .lean(),
      Travel.countDocuments(filter),
    ]);

    return { items, total };
  }

  let filtered = memory.travels.filter((t) => {
    if (!includeArchived && t.isArchived) return false;
    if (!includeUnavailable && t.isAvailable === false) return false;
    if (category && (t.category || "").toLowerCase() !== category.toLowerCase()) {
      return false;
    }
    if (country && (t.country || "").toLowerCase() !== country.toLowerCase()) {
      return false;
    }
    if (region && (t.region || "").toLowerCase() !== region.toLowerCase()) {
      return false;
    }
    if (featured === true && !t.featured) return false;
    if (isHiddenGem === true && !t.isHiddenGem) return false;

    const acc = t.accessibility || {};
    if (wheelchairAccessible && (acc.wheelchairAccessible || "unknown") !== wheelchairAccessible) {
      return false;
    }
    if (
      accessibleAccommodation &&
      (acc.accessibleAccommodation || "unknown") !== accessibleAccommodation
    ) {
      return false;
    }
    if (publicTransport && (acc.publicTransport || "unknown") !== publicTransport) {
      return false;
    }
    if (familyFriendly && (acc.familyFriendly || "unknown") !== familyFriendly) {
      return false;
    }
    if (
      accessibleAttractions &&
      (acc.accessibleAttractions || "unknown") !== accessibleAttractions
    ) {
      return false;
    }
    if (walkingIntensity && (acc.walkingIntensity || "unknown") !== walkingIntensity) {
      return false;
    }

    if (minPrice !== undefined && Number(t.pricePerNight) < Number(minPrice)) {
      return false;
    }
    if (maxPrice !== undefined && Number(t.pricePerNight) > Number(maxPrice)) {
      return false;
    }
    if (minRating !== undefined && Number(t.rating || 0) < Number(minRating)) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const haystack = [
        t.title,
        t.city,
        t.country,
        t.state,
        t.region,
        t.location,
        t.category,
        t.description,
        t.bestTimeToVisit,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const valA = a[safeSortBy];
    const valB = b[safeSortBy];
    if (typeof valA === "number" && typeof valB === "number") {
      return (valA - valB) * direction;
    }
    return String(valA || "").localeCompare(String(valB || "")) * direction;
  });

  return {
    items: filtered.slice(skip, skip + limit).map((item) => ({ ...item })),
    total: filtered.length,
  };
}

async function getTravelFacets() {
  if (isDbConnected()) {
    const [categories, countries] = await Promise.all([
      Travel.distinct("category", { isArchived: { $ne: true } }),
      Travel.distinct("country", { isArchived: { $ne: true } }),
    ]);
    return {
      categories: categories.filter(Boolean).sort(),
      countries: countries.filter(Boolean).sort(),
    };
  }
  const active = memory.travels.filter((t) => !t.isArchived);
  const categories = [...new Set(active.map((t) => t.category).filter(Boolean))].sort();
  const countries = [...new Set(active.map((t) => t.country).filter(Boolean))].sort();
  return { categories, countries };
}

async function findTravelById(id) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid destination ID.");
  }
  if (isDbConnected()) {
    return Travel.findById(id).lean();
  }
  const found = memory.travels.find((t) => t._id === id || t.slug === id);
  return found ? { ...found } : null;
}

async function createTravel(data, adminUserId) {
  const slug = slugify(`${data.city || ""}-${data.title}`);
  if (isDbConnected()) {
    const exists = await Travel.findOne({ slug }).lean();
    const finalSlug = exists ? `${slug}-${crypto.randomBytes(3).toString("hex")}` : slug;
    const created = await Travel.create({
      ...data,
      slug: finalSlug,
      createdBy: adminUserId,
    });
    return created.toObject();
  }

  const exists = memory.travels.some((t) => t.slug === slug);
  const finalSlug = exists ? `${slug}-${crypto.randomBytes(3).toString("hex")}` : slug;
  const now = new Date().toISOString();
  const travel = {
    _id: createId("travel"),
    ...data,
    slug: finalSlug,
    currency: data.currency || "USD",
    priceIsEstimate: true,
    isAvailable: data.isAvailable !== undefined ? Boolean(data.isAvailable) : true,
    isArchived: false,
    maxCapacity: data.maxCapacity || 20,
    highlights: data.highlights || [],
    amenities: data.amenities || [],
    activities: data.activities || [],
    travelTips: data.travelTips || [],
    gallery: data.gallery && data.gallery.length ? data.gallery : [data.image.url],
    createdBy: adminUserId,
    createdAt: now,
    updatedAt: now,
  };
  memory.travels.unshift(travel);
  return { ...travel };
}

async function updateTravel(id, updates) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid destination ID.");
  }
  if (isDbConnected()) {
    const updated = await Travel.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true },
    ).lean();
    if (!updated) throw new ApiError(404, "Destination not found.");
    return updated;
  }
  const idx = memory.travels.findIndex((t) => t._id === id);
  if (idx === -1) throw new ApiError(404, "Destination not found.");
  memory.travels[idx] = {
    ...memory.travels[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  return { ...memory.travels[idx] };
}

async function deleteOrArchiveTravel(id) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid destination ID.");
  }
  if (isDbConnected()) {
    const travel = await Travel.findById(id).lean();
    if (!travel) throw new ApiError(404, "Destination not found.");
    const existingBookings = await Booking.countDocuments({ travel: id });
    if (existingBookings > 0) {
      const archived = await Travel.findByIdAndUpdate(
        id,
        { $set: { isArchived: true, isAvailable: false } },
        { new: true },
      ).lean();
      return { action: "archived", destination: archived };
    }
    await Travel.findByIdAndDelete(id);
    await Favourite.deleteMany({ travel: id });
    return { action: "deleted", destination: travel };
  }

  const idx = memory.travels.findIndex((t) => t._id === id);
  if (idx === -1) throw new ApiError(404, "Destination not found.");
  const hasBookings = memory.bookings.some((b) => b.travel === id);
  if (hasBookings) {
    memory.travels[idx] = {
      ...memory.travels[idx],
      isArchived: true,
      isAvailable: false,
      updatedAt: new Date().toISOString(),
    };
    return { action: "archived", destination: { ...memory.travels[idx] } };
  }
  const [removed] = memory.travels.splice(idx, 1);
  memory.favorites = memory.favorites.filter((f) => f.travel !== id);
  return { action: "deleted", destination: removed };
}

// ============================
// BOOKINGS
// ============================

async function countBookedTravelersForDate(travelId, startDate) {
  const dayKey = new Date(startDate).toISOString().slice(0, 10);
  if (isDbConnected()) {
    const startOfDay = new Date(`${dayKey}T00:00:00.000Z`);
    const endOfDay = new Date(`${dayKey}T23:59:59.999Z`);
    const agg = await Booking.aggregate([
      {
        $match: {
          travel: new (require("mongoose").Types.ObjectId)(travelId),
          status: "confirmed",
          startDate: { $gte: startOfDay, $lte: endOfDay },
        },
      },
      { $group: { _id: null, totalTravelers: { $sum: "$travelers" } } },
    ]);
    return agg[0]?.totalTravelers || 0;
  }

  return memory.bookings
    .filter(
      (b) =>
        b.travel === travelId &&
        b.status === "confirmed" &&
        new Date(b.startDate).toISOString().slice(0, 10) === dayKey,
    )
    .reduce((sum, b) => sum + Number(b.travelers || 0), 0);
}

async function findRecentDuplicateBooking({ userId, travelId, startDate, duration, travelers, idempotencyKey }) {
  const dayKey = new Date(startDate).toISOString().slice(0, 10);
  const cutoff = new Date(Date.now() - 60 * 1000);

  if (isDbConnected()) {
    if (idempotencyKey) {
      const byKey = await Booking.findOne({ user: userId, idempotencyKey }).populate("travel").lean();
      if (byKey) return byKey;
    }
    const startOfDay = new Date(`${dayKey}T00:00:00.000Z`);
    const endOfDay = new Date(`${dayKey}T23:59:59.999Z`);
    return Booking.findOne({
      user: userId,
      travel: travelId,
      travelers,
      duration,
      status: "confirmed",
      startDate: { $gte: startOfDay, $lte: endOfDay },
      createdAt: { $gte: cutoff },
    })
      .populate("travel")
      .lean();
  }

  if (idempotencyKey) {
    const byKey = memory.bookings.find(
      (b) => b.user === userId && b.idempotencyKey === idempotencyKey,
    );
    if (byKey) return populateBookingMemory(byKey);
  }

  const dup = memory.bookings.find(
    (b) =>
      b.user === userId &&
      b.travel === travelId &&
      b.travelers === travelers &&
      b.duration === duration &&
      b.status === "confirmed" &&
      new Date(b.startDate).toISOString().slice(0, 10) === dayKey &&
      new Date(b.createdAt) >= cutoff,
  );
  return dup ? populateBookingMemory(dup) : null;
}

function populateBookingMemory(booking) {
  const travel = memory.travels.find((t) => t._id === booking.travel) || null;
  const user = memory.users.find((u) => u._id === booking.user);
  return {
    ...booking,
    travel: travel ? { ...travel } : null,
    userDetails: user ? { _id: user._id, username: user.username, email: user.email } : null,
  };
}

async function createBookingRecord(payload) {
  if (isDbConnected()) {
    const created = await Booking.create(payload);
    return Booking.findById(created._id).populate("travel").lean();
  }
  const now = new Date().toISOString();
  const record = {
    _id: createId("booking"),
    ...payload,
    createdAt: now,
    updatedAt: now,
  };
  memory.bookings.unshift(record);
  return populateBookingMemory(record);
}

async function findBookingById(id) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid booking ID.");
  }
  if (isDbConnected()) {
    return Booking.findById(id).populate("travel").lean();
  }
  const found = memory.bookings.find((b) => b._id === id);
  return found ? populateBookingMemory(found) : null;
}

async function listUserBookings(userId) {
  if (isDbConnected()) {
    return Booking.find({ user: userId })
      .populate("travel")
      .sort({ createdAt: -1 })
      .lean();
  }
  return memory.bookings
    .filter((b) => b.user === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(populateBookingMemory);
}

async function listAllBookings({ skip = 0, limit = 20, status = "" } = {}) {
  if (isDbConnected()) {
    const filter = status ? { status } : {};
    const [items, total] = await Promise.all([
      Booking.find(filter)
        .populate("travel", "title city country pricePerNight image")
        .populate("user", "username email role")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Booking.countDocuments(filter),
    ]);
    return { items, total };
  }
  const filtered = memory.bookings
    .filter((b) => (!status ? true : b.status === status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return {
    items: filtered.slice(skip, skip + limit).map(populateBookingMemory),
    total: filtered.length,
  };
}

async function cancelBookingRecord(id) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid booking ID.");
  }
  const now = new Date();
  if (isDbConnected()) {
    return Booking.findByIdAndUpdate(
      id,
      { $set: { status: "cancelled", paymentStatus: "cancelled", cancelledAt: now } },
      { new: true },
    )
      .populate("travel")
      .lean();
  }
  const idx = memory.bookings.findIndex((b) => b._id === id);
  if (idx === -1) throw new ApiError(404, "Booking not found.");
  memory.bookings[idx] = {
    ...memory.bookings[idx],
    status: "cancelled",
    paymentStatus: "cancelled",
    cancelledAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  return populateBookingMemory(memory.bookings[idx]);
}

// ============================
// FAVORITES (Unified collection)
// ============================

async function listUserFavorites(userId) {
  if (isDbConnected()) {
    return Favourite.find({ user: userId })
      .populate("travel")
      .sort({ createdAt: -1 })
      .lean();
  }
  return memory.favorites
    .filter((f) => f.user === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((f) => ({
      ...f,
      travel: memory.travels.find((t) => t._id === f.travel) || null,
    }));
}

async function addFavoriteRecord(userId, travelId) {
  if (!isValidEntityId(travelId, isDbConnected())) {
    throw new ApiError(400, "Invalid destination ID.");
  }
  const travel = await findTravelById(travelId);
  if (!travel || travel.isArchived) {
    throw new ApiError(404, "Destination not found.");
  }

  if (isDbConnected()) {
    const existing = await Favourite.findOne({ user: userId, travel: travelId }).lean();
    if (existing) {
      throw new ApiError(409, "Destination is already in favorites.");
    }
    const created = await Favourite.create({ user: userId, travel: travelId });
    return Favourite.findById(created._id).populate("travel").lean();
  }

  const existing = memory.favorites.find(
    (f) => f.user === userId && f.travel === travelId,
  );
  if (existing) {
    throw new ApiError(409, "Destination is already in favorites.");
  }
  const fav = {
    _id: createId("fav"),
    user: userId,
    travel: travelId,
    createdAt: new Date().toISOString(),
  };
  memory.favorites.unshift(fav);
  return { ...fav, travel };
}

async function removeFavoriteRecord(userId, idOrTravelId) {
  if (!isValidEntityId(idOrTravelId, isDbConnected())) {
    throw new ApiError(400, "Invalid favorite or destination ID.");
  }
  if (isDbConnected()) {
    const deleted = await Favourite.findOneAndDelete({
      user: userId,
      $or: [{ _id: idOrTravelId }, { travel: idOrTravelId }],
    }).lean();
    if (!deleted) {
      throw new ApiError(404, "Favorite not found.");
    }
    return deleted;
  }

  const idx = memory.favorites.findIndex(
    (f) => f.user === userId && (f._id === idOrTravelId || f.travel === idOrTravelId),
  );
  if (idx === -1) {
    throw new ApiError(404, "Favorite not found.");
  }
  const [removed] = memory.favorites.splice(idx, 1);
  return removed;
}

// ============================
// PACKAGES
// ============================

async function listPackages(category = "") {
  if (isDbConnected()) {
    const filter = category
      ? { category: new RegExp(`^${escapeRegex(category)}$`, "i") }
      : {};
    return Package.find(filter).lean();
  }
  if (!category) return memory.packages.map((p) => ({ ...p }));
  return memory.packages
    .filter((p) => (p.category || "").toLowerCase() === category.toLowerCase())
    .map((p) => ({ ...p }));
}

async function findPackageById(id) {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid package ID.");
  }
  if (isDbConnected()) {
    return Package.findById(id).lean();
  }
  return memory.packages.find((p) => p._id === id) || null;
}

// ============================
// CHATBOT GROUNDING QUERIES
// ============================

async function searchDestinationsForChatbot(queryText, limit = 8) {
  const text = String(queryText || "").toLowerCase();
  const { items: all } = await listTravels({ limit: 100, skip: 0 });

  // Detect budget hints in INR (₹) or USD ($)
  let maxNightlyUsd = null;
  const inrMatch = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+)/i);
  const usdMatch = text.match(/\$\s*([\d,]+)/i);
  const daysMatch = text.match(/(\d+)\s*(?:-|\s)?(?:day|days|night|nights)/i);
  const tripDays = daysMatch ? Math.max(1, Math.min(30, Number(daysMatch[1]))) : 4;

  if (inrMatch) {
    const inrBudget = Number(inrMatch[1].replace(/,/g, ""));
    if (Number.isFinite(inrBudget) && inrBudget > 0) {
      const usdTotal = inrBudget / 83;
      maxNightlyUsd = Math.max(45, Math.round((usdTotal / tripDays) * 1.15));
    }
  } else if (usdMatch) {
    const usdBudget = Number(usdMatch[1].replace(/,/g, ""));
    if (Number.isFinite(usdBudget) && usdBudget > 0) {
      maxNightlyUsd = Math.max(45, Math.round((usdBudget / tripDays) * 1.15));
    }
  }

  // Regional hints
  const northeastStates = ["sikkim", "west bengal", "meghalaya", "arunachal pradesh", "assam"];
  const kolkataWeekendCities = ["digha", "darjeeling", "kalimpong", "puri", "sundarbans", "gosaba", "gangtok", "shillong"];

  const tokens = text
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);

  const scored = all.map((dest) => {
    let score = 0;
    const blob = [
      dest.title,
      dest.city,
      dest.state,
      dest.country,
      dest.category,
      dest.bestTimeToVisit,
      dest.description,
      ...(dest.highlights || []),
      ...(dest.activities || []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    for (const token of tokens) {
      if (dest.city?.toLowerCase().includes(token)) score += 6;
      if (dest.country?.toLowerCase().includes(token)) score += 4;
      if (dest.state?.toLowerCase().includes(token)) score += 5;
      if (dest.category?.toLowerCase().includes(token)) score += 4;
      if (dest.bestTimeToVisit?.toLowerCase().includes(token)) score += 3;
      if (blob.includes(token)) score += 1;
    }

    if (text.includes("northeast") || text.includes("north east")) {
      if (northeastStates.includes((dest.state || "").toLowerCase())) score += 8;
    }
    if (text.includes("kolkata")) {
      if (kolkataWeekendCities.includes((dest.city || "").toLowerCase()) || (dest.state || "").toLowerCase() === "west bengal") {
        score += 8;
      }
    }
    if (text.includes("peaceful") || text.includes("quiet") || text.includes("relax")) {
      if (["Nature", "Spiritual", "Mountain"].includes(dest.category)) score += 3;
    }
    if (text.includes("india") && dest.country === "India") {
      score += 3;
    }
    if (maxNightlyUsd !== null) {
      if (dest.pricePerNight <= maxNightlyUsd) {
        score += 4;
      } else {
        score -= 3;
      }
    }
    if (dest.featured) score += 0.5;

    return { dest, score };
  });

  scored.sort((a, b) => b.score - a.score || b.dest.rating - a.dest.rating);
  const top = scored.filter((s) => s.score > 0).slice(0, limit);
  const fallback = scored.slice(0, Math.min(5, limit));
  return (top.length > 0 ? top : fallback).map((s) => s.dest);
}

async function listAllActiveTravels() {
  if (isDbConnected()) {
    return Travel.find({ isArchived: { $ne: true }, isAvailable: { $ne: false } }).lean();
  }
  return memory.travels
    .filter((t) => !t.isArchived && t.isAvailable !== false)
    .map((item) => ({ ...item }));
}

async function incrementTravelView(id) {
  if (!isValidEntityId(id, isDbConnected())) return null;
  if (isDbConnected()) {
    return Travel.findByIdAndUpdate(id, { $inc: { viewCount: 1 } }, { new: true }).lean();
  }
  const idx = memory.travels.findIndex((t) => t._id === id);
  if (idx === -1) return null;
  memory.travels[idx].viewCount = (memory.travels[idx].viewCount || 0) + 1;
  return { ...memory.travels[idx] };
}

async function updateTravelAccessibility(id, updates, source = "user-submitted") {
  if (!isValidEntityId(id, isDbConnected())) {
    throw new ApiError(400, "Invalid destination ID.");
  }
  const TRI = new Set(["yes", "no", "unknown"]);
  const WALK = new Set(["low", "moderate", "high", "unknown"]);

  const existing = await findTravelById(id);
  if (!existing) throw new ApiError(404, "Destination not found.");

  const nextAcc = {
    ...(existing.accessibility || {}),
    source,
    lastUpdated: new Date().toISOString(),
  };

  for (const field of [
    "wheelchairAccessible",
    "accessibleAccommodation",
    "publicTransport",
    "familyFriendly",
    "accessibleAttractions",
  ]) {
    if (updates[field] && TRI.has(updates[field])) {
      nextAcc[field] = updates[field];
    }
  }
  if (updates.walkingIntensity && WALK.has(updates.walkingIntensity)) {
    nextAcc.walkingIntensity = updates.walkingIntensity;
  }
  if (typeof updates.notes === "string") {
    nextAcc.notes = updates.notes.trim().slice(0, 400);
  }

  if (isDbConnected()) {
    return Travel.findByIdAndUpdate(id, { $set: { accessibility: nextAcc } }, { new: true }).lean();
  }
  const idx = memory.travels.findIndex((t) => t._id === id);
  memory.travels[idx] = { ...memory.travels[idx], accessibility: nextAcc };
  return { ...memory.travels[idx] };
}

module.exports = {
  resetMemoryStore,
  countAdmins,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserProfile,
  updateUserRole,
  listUsers,
  listTravels,
  listAllActiveTravels,
  getTravelFacets,
  findTravelById,
  createTravel,
  updateTravel,
  deleteOrArchiveTravel,
  incrementTravelView,
  updateTravelAccessibility,
  countBookedTravelersForDate,
  findRecentDuplicateBooking,
  createBookingRecord,
  findBookingById,
  listUserBookings,
  listAllBookings,
  cancelBookingRecord,
  listUserFavorites,
  addFavoriteRecord,
  removeFavoriteRecord,
  listPackages,
  findPackageById,
  searchDestinationsForChatbot,
};

const crypto = require("crypto");
const { isDbConnected } = require("../config/database");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");
const {
  Property,
  RoomType,
  RoomInventory,
  StayBooking,
  StayReview,
} = require("../models/StayModels");
const {
  BusRoute,
  CarVehicle,
  TransportReservation,
} = require("../models/TransportModels");
const {
  Activity,
  ActivityBooking,
  TourGuide,
  GuideBooking,
  GuideReview,
  Restaurant,
  RestaurantReservation,
} = require("../models/ExperienceModels");
const {
  PaymentTransaction,
  WalletDocument,
  NotificationPreference,
} = require("../models/CommerceModels");
const seed = require("../data/commerceSeedData");

function createRef(prefix) {
  return `${prefix}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function createId(prefix) {
  return `${prefix}-${crypto.randomBytes(6).toString("hex")}`;
}

function enumerateDateKeys(checkInDate, checkOutDate) {
  const start = new Date(`${checkInDate}T00:00:00.000Z`);
  const end = new Date(`${checkOutDate}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return [];
  }
  const keys = [];
  const cur = new Date(start);
  while (cur < end && keys.length < 60) {
    keys.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return keys;
}

function createInitialMemory() {
  return {
    properties: seed.PROPERTIES_SEED.map((p) => ({ ...p })),
    roomTypes: seed.ROOM_TYPES_SEED.map((r) => ({ ...r })),
    // key: `${roomTypeId}:${dateKey}` -> bookedQuantity
    roomInventory: new Map(),
    stayBookings: [],
    stayReviews: [],
    busRoutes: seed.BUS_ROUTES_SEED.map((b) => ({ ...b })),
    carVehicles: seed.CAR_VEHICLES_SEED.map((c) => ({ ...c })),
    transportReservations: [],
    activities: seed.ACTIVITIES_SEED.map((a) => ({ ...a })),
    activityBookings: [],
    tourGuides: seed.TOUR_GUIDES_SEED.map((g) => ({ ...g })),
    guideBookings: [],
    guideReviews: [],
    restaurants: seed.RESTAURANTS_SEED.map((r) => ({ ...r })),
    restaurantReservations: [],
    payments: [],
    walletDocuments: [],
    notificationPreferences: new Map(),
  };
}

let mem = createInitialMemory();

function resetCommerceMemoryStore() {
  mem = createInitialMemory();
}

// ============================
// PROPERTIES & ROOM INVENTORY (Modules 13, 14, 15, 16)
// ============================
async function listProperties() {
  if (isDbConnected()) {
    const docs = await Property.find({ isActive: true }).lean();
    if (docs.length > 0) return docs;
  }
  return mem.properties.filter((p) => p.isActive !== false).map((p) => ({ ...p }));
}

async function findPropertyById(id) {
  if (isDbConnected()) {
    const doc = await Property.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.properties.find((p) => p._id === id);
  return found ? { ...found } : null;
}

async function createProperty(data) {
  if (isDbConnected()) {
    const doc = await Property.create(data);
    return doc.toObject();
  }
  const item = { _id: createId("prop"), isActive: true, reviewCount: 0, guestRating: 4.5, ...data };
  mem.properties.unshift(item);
  return { ...item };
}

async function listRoomTypesForProperty(propertyId) {
  if (isDbConnected()) {
    const docs = await RoomType.find({ propertyId }).lean();
    if (docs.length > 0) return docs;
  }
  return mem.roomTypes.filter((r) => r.propertyId === propertyId).map((r) => ({ ...r }));
}

async function findRoomTypeById(roomTypeId) {
  if (isDbConnected()) {
    const doc = await RoomType.findById(roomTypeId).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.roomTypes.find((r) => r._id === roomTypeId);
  return found ? { ...found } : null;
}

async function createRoomType(data) {
  if (isDbConnected()) {
    const doc = await RoomType.create(data);
    return doc.toObject();
  }
  const item = { _id: createId("room"), availabilityStatus: "AVAILABLE", ...data };
  mem.roomTypes.push(item);
  return { ...item };
}

async function updateRoomType(roomTypeId, updates) {
  if (isDbConnected()) {
    const doc = await RoomType.findByIdAndUpdate(roomTypeId, { $set: updates }, { new: true }).lean().catch(() => null);
    if (doc) return doc;
  }
  const idx = mem.roomTypes.findIndex((r) => r._id === roomTypeId);
  if (idx === -1) return null;
  mem.roomTypes[idx] = { ...mem.roomTypes[idx], ...updates };
  return { ...mem.roomTypes[idx] };
}

async function getMinAvailableRooms(roomType, checkInDate, checkOutDate) {
  if (roomType.availabilityStatus === "MAINTENANCE" || roomType.availabilityStatus === "SOLD_OUT") {
    return 0;
  }
  const dates = enumerateDateKeys(checkInDate, checkOutDate);
  if (dates.length === 0) return roomType.totalQuantity;

  if (isDbConnected()) {
    const docs = await RoomInventory.find({
      roomTypeId: String(roomType._id),
      dateKey: { $in: dates },
    }).lean();
    const map = new Map(docs.map((d) => [d.dateKey, d.bookedQuantity]));
    let minAvail = roomType.totalQuantity;
    for (const d of dates) {
      const booked = map.get(d) || 0;
      minAvail = Math.min(minAvail, Math.max(0, roomType.totalQuantity - booked));
    }
    return minAvail;
  }

  let minAvail = roomType.totalQuantity;
  for (const d of dates) {
    const booked = mem.roomInventory.get(`${roomType._id}:${d}`) || 0;
    minAvail = Math.min(minAvail, Math.max(0, roomType.totalQuantity - booked));
  }
  return minAvail;
}

// Atomic reservation of room inventory across every night in [checkInDate, checkOutDate)
// Uses conditional MongoDB updates ($lte capacity) with automatic rollback if any night fails,
// and synchronous atomic check-and-commit in memory fallback so concurrent requests cannot double-book.
async function reserveRoomInventoryAtomic(roomType, checkInDate, checkOutDate, roomsRequested) {
  const dates = enumerateDateKeys(checkInDate, checkOutDate);
  if (dates.length === 0) return { ok: false, reason: "Invalid check-in/check-out date range." };
  if (roomType.availabilityStatus === "MAINTENANCE" || roomType.availabilityStatus === "SOLD_OUT") {
    return { ok: false, reason: "Room type is currently unavailable." };
  }

  if (isDbConnected()) {
    const reservedDates = [];
    try {
      for (const dateKey of dates) {
        // Ensure inventory doc exists
        await RoomInventory.updateOne(
          { roomTypeId: String(roomType._id), dateKey },
          {
            $setOnInsert: {
              propertyId: String(roomType.propertyId),
              roomTypeId: String(roomType._id),
              dateKey,
              totalQuantity: roomType.totalQuantity,
              bookedQuantity: 0,
            },
          },
          { upsert: true },
        );

        // Conditional atomic increment: only succeeds if bookedQuantity + roomsRequested <= totalQuantity
        const updated = await RoomInventory.findOneAndUpdate(
          {
            roomTypeId: String(roomType._id),
            dateKey,
            bookedQuantity: { $lte: roomType.totalQuantity - roomsRequested },
          },
          { $inc: { bookedQuantity: roomsRequested } },
          { new: true },
        );

        if (!updated) {
          throw new Error(`INSUFFICIENT_INVENTORY:${dateKey}`);
        }
        reservedDates.push(dateKey);
      }
      return { ok: true, dates };
    } catch (err) {
      // Roll back any already-incremented nights
      for (const d of reservedDates) {
        await RoomInventory.updateOne(
          { roomTypeId: String(roomType._id), dateKey: d },
          { $inc: { bookedQuantity: -roomsRequested } },
        ).catch(() => {});
      }
      if (String(err.message).startsWith("INSUFFICIENT_INVENTORY:")) {
        return {
          ok: false,
          reason: `Not enough ${roomType.name} rooms available on ${err.message.split(":")[1]}.`,
        };
      }
      throw err;
    }
  }

  // Synchronous atomic check-and-update in Node single-threaded event loop
  for (const dateKey of dates) {
    const key = `${roomType._id}:${dateKey}`;
    const booked = mem.roomInventory.get(key) || 0;
    if (booked + roomsRequested > roomType.totalQuantity) {
      return {
        ok: false,
        reason: `Not enough ${roomType.name} rooms available on ${dateKey}.`,
      };
    }
  }
  for (const dateKey of dates) {
    const key = `${roomType._id}:${dateKey}`;
    const booked = mem.roomInventory.get(key) || 0;
    mem.roomInventory.set(key, booked + roomsRequested);
  }
  return { ok: true, dates };
}

async function releaseRoomInventory(roomTypeId, checkInDate, checkOutDate, roomsBooked) {
  const dates = enumerateDateKeys(checkInDate, checkOutDate);
  if (isDbConnected()) {
    for (const dateKey of dates) {
      await RoomInventory.updateOne(
        { roomTypeId: String(roomTypeId), dateKey, bookedQuantity: { $gte: roomsBooked } },
        { $inc: { bookedQuantity: -roomsBooked } },
      ).catch(() => {});
    }
    return;
  }
  for (const dateKey of dates) {
    const key = `${roomTypeId}:${dateKey}`;
    const booked = mem.roomInventory.get(key) || 0;
    mem.roomInventory.set(key, Math.max(0, booked - roomsBooked));
  }
}

async function createStayBooking(data) {
  const record = {
    bookingReference: createRef("STAY"),
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await StayBooking.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("sbk"), ...record, createdAt: now, updatedAt: now };
  mem.stayBookings.unshift(item);
  return { ...item };
}

async function listUserStayBookings(userId) {
  if (isDbConnected()) {
    return StayBooking.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.stayBookings.filter((b) => String(b.user) === String(userId)).map((b) => ({ ...b }));
}

async function findStayBookingById(id) {
  if (isDbConnected()) {
    return StayBooking.findById(id).lean().catch(() => null);
  }
  const found = mem.stayBookings.find((b) => b._id === id);
  return found ? { ...found } : null;
}

async function updateStayBooking(id, updates) {
  if (isDbConnected()) {
    return StayBooking.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.stayBookings.findIndex((b) => b._id === id);
  if (idx === -1) return null;
  mem.stayBookings[idx] = { ...mem.stayBookings[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.stayBookings[idx] };
}

// Module 16: Reviews
async function listStayReviews(propertyId, includeHidden = false) {
  if (isDbConnected()) {
    const filter = includeHidden
      ? { propertyId }
      : { propertyId, moderationStatus: { $ne: "HIDDEN" } };
    return StayReview.find(filter).sort({ createdAt: -1 }).lean();
  }
  return mem.stayReviews
    .filter((r) => r.propertyId === propertyId && (includeHidden || r.moderationStatus !== "HIDDEN"))
    .map((r) => ({ ...r }));
}

async function findReviewByBookingId(bookingId) {
  if (isDbConnected()) {
    return StayReview.findOne({ bookingId }).lean();
  }
  return mem.stayReviews.find((r) => r.bookingId === bookingId) || null;
}

async function createStayReview(data) {
  if (isDbConnected()) {
    const doc = await StayReview.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("srev"), moderationStatus: "APPROVED", ...data, createdAt: now };
  mem.stayReviews.unshift(item);
  // Update property rating average
  const revs = mem.stayReviews.filter((r) => r.propertyId === data.propertyId && r.moderationStatus === "APPROVED");
  const pIdx = mem.properties.findIndex((p) => p._id === data.propertyId);
  if (pIdx !== -1 && revs.length > 0) {
    const avg = revs.reduce((s, r) => s + Number(r.overallRating), 0) / revs.length;
    mem.properties[pIdx].guestRating = Math.round(avg * 10) / 10;
    mem.properties[pIdx].reviewCount = revs.length;
  }
  return { ...item };
}

async function findStayReviewById(id) {
  if (isDbConnected()) {
    return StayReview.findById(id).lean().catch(() => null);
  }
  const found = mem.stayReviews.find((r) => r._id === id);
  return found ? { ...found } : null;
}

async function updateStayReview(id, updates) {
  if (isDbConnected()) {
    return StayReview.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.stayReviews.findIndex((r) => r._id === id);
  if (idx === -1) return null;
  mem.stayReviews[idx] = { ...mem.stayReviews[idx], ...updates };
  return { ...mem.stayReviews[idx] };
}

// ============================
// TRANSPORT (Modules 17–21)
// ============================
async function listBusRoutes() {
  if (isDbConnected()) {
    const docs = await BusRoute.find().lean();
    if (docs.length > 0) return docs;
  }
  return mem.busRoutes.map((b) => ({ ...b }));
}

async function findBusRouteById(id) {
  if (isDbConnected()) {
    const doc = await BusRoute.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.busRoutes.find((b) => b._id === id);
  return found ? { ...found } : null;
}

async function getBookedBusSeats(routeId, travelDate) {
  if (isDbConnected()) {
    const rows = await TransportReservation.find({
      mode: "BUS",
      routeOrVehicleId: routeId,
      travelDate,
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING] },
    }).lean();
    return rows.flatMap((r) => r.seatNumbers || []);
  }
  return mem.transportReservations
    .filter(
      (r) =>
        r.mode === "BUS" &&
        r.routeOrVehicleId === routeId &&
        r.travelDate === travelDate &&
        (r.status === BOOKING_STATUS.CONFIRMED || r.status === BOOKING_STATUS.PENDING),
    )
    .flatMap((r) => r.seatNumbers || []);
}

async function listCarVehicles() {
  if (isDbConnected()) {
    const docs = await CarVehicle.find().lean();
    if (docs.length > 0) return docs;
  }
  return mem.carVehicles.map((c) => ({ ...c }));
}

async function findCarVehicleById(id) {
  if (isDbConnected()) {
    const doc = await CarVehicle.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.carVehicles.find((c) => c._id === id);
  return found ? { ...found } : null;
}

async function createTransportReservation(data) {
  const prefix =
    data.mode === "BUS"
      ? "BUS"
      : data.mode === "CAR_RENTAL"
        ? "CAR"
        : data.mode === "FLIGHT_REF"
          ? "FLT"
          : "TRN";
  const record = {
    bookingReference: createRef(prefix),
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await TransportReservation.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("trp"), ...record, createdAt: now, updatedAt: now };
  mem.transportReservations.unshift(item);
  return { ...item };
}

async function listUserTransportReservations(userId) {
  if (isDbConnected()) {
    return TransportReservation.find({ user: String(userId) }).sort({ travelDate: 1, createdAt: -1 }).lean();
  }
  return mem.transportReservations
    .filter((r) => String(r.user) === String(userId))
    .sort((a, b) => String(a.travelDate).localeCompare(String(b.travelDate)))
    .map((r) => ({ ...r }));
}

async function findTransportReservationById(id) {
  if (isDbConnected()) {
    return TransportReservation.findById(id).lean().catch(() => null);
  }
  const found = mem.transportReservations.find((r) => r._id === id);
  return found ? { ...found } : null;
}

async function updateTransportReservation(id, updates) {
  if (isDbConnected()) {
    return TransportReservation.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.transportReservations.findIndex((r) => r._id === id);
  if (idx === -1) return null;
  mem.transportReservations[idx] = { ...mem.transportReservations[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.transportReservations[idx] };
}

// ============================
// ACTIVITIES, GUIDES & RESTAURANTS (Modules 22, 23, 24)
// ============================
async function listActivities() {
  if (isDbConnected()) {
    const docs = await Activity.find().lean();
    if (docs.length > 0) return docs;
  }
  return mem.activities.map((a) => ({ ...a }));
}

async function findActivityById(id) {
  if (isDbConnected()) {
    const doc = await Activity.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.activities.find((a) => a._id === id);
  return found ? { ...found } : null;
}

async function countActivitySlotBooked(activityId, date, timeSlot) {
  if (isDbConnected()) {
    const rows = await ActivityBooking.find({
      activityId,
      date,
      timeSlot,
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING] },
    }).lean();
    return rows.reduce((s, r) => s + Number(r.participants || 0), 0);
  }
  return mem.activityBookings
    .filter(
      (b) =>
        b.activityId === activityId &&
        b.date === date &&
        b.timeSlot === timeSlot &&
        (b.status === BOOKING_STATUS.CONFIRMED || b.status === BOOKING_STATUS.PENDING),
    )
    .reduce((s, b) => s + Number(b.participants || 0), 0);
}

async function createActivityBooking(data) {
  const record = {
    bookingReference: createRef("ACT"),
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await ActivityBooking.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("abk"), ...record, createdAt: now, updatedAt: now };
  mem.activityBookings.unshift(item);
  return { ...item };
}

async function listUserActivityBookings(userId) {
  if (isDbConnected()) {
    return ActivityBooking.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.activityBookings.filter((b) => String(b.user) === String(userId)).map((b) => ({ ...b }));
}

async function findActivityBookingById(id) {
  if (isDbConnected()) {
    return ActivityBooking.findById(id).lean().catch(() => null);
  }
  const found = mem.activityBookings.find((b) => b._id === id);
  return found ? { ...found } : null;
}

async function updateActivityBooking(id, updates) {
  if (isDbConnected()) {
    return ActivityBooking.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.activityBookings.findIndex((b) => b._id === id);
  if (idx === -1) return null;
  mem.activityBookings[idx] = { ...mem.activityBookings[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.activityBookings[idx] };
}

async function listTourGuides() {
  if (isDbConnected()) {
    const docs = await TourGuide.find().lean();
    if (docs.length > 0) return docs;
  }
  return mem.tourGuides.map((g) => ({ ...g }));
}

async function findTourGuideById(id) {
  if (isDbConnected()) {
    const doc = await TourGuide.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.tourGuides.find((g) => g._id === id);
  return found ? { ...found } : null;
}

async function createGuideBooking(data) {
  const record = {
    bookingReference: createRef("GDE"),
    status: BOOKING_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await GuideBooking.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("gbk"), ...record, createdAt: now, updatedAt: now };
  mem.guideBookings.unshift(item);
  return { ...item };
}

async function listUserGuideBookings(userId) {
  if (isDbConnected()) {
    return GuideBooking.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.guideBookings.filter((b) => String(b.user) === String(userId)).map((b) => ({ ...b }));
}

async function findGuideBookingById(id) {
  if (isDbConnected()) {
    return GuideBooking.findById(id).lean().catch(() => null);
  }
  const found = mem.guideBookings.find((b) => b._id === id);
  return found ? { ...found } : null;
}

async function updateGuideBooking(id, updates) {
  if (isDbConnected()) {
    return GuideBooking.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.guideBookings.findIndex((b) => b._id === id);
  if (idx === -1) return null;
  mem.guideBookings[idx] = { ...mem.guideBookings[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.guideBookings[idx] };
}

async function listGuideReviews(guideId) {
  if (isDbConnected()) {
    return GuideReview.find({ guideId }).sort({ createdAt: -1 }).lean();
  }
  return mem.guideReviews.filter((r) => r.guideId === guideId).map((r) => ({ ...r }));
}

async function createGuideReview(data) {
  if (isDbConnected()) {
    const doc = await GuideReview.create(data);
    return doc.toObject();
  }
  const item = { _id: createId("grev"), ...data, createdAt: new Date().toISOString() };
  mem.guideReviews.unshift(item);
  return { ...item };
}

async function listRestaurants() {
  if (isDbConnected()) {
    const docs = await Restaurant.find().lean();
    if (docs.length > 0) return docs;
  }
  return mem.restaurants.map((r) => ({ ...r }));
}

async function findRestaurantById(id) {
  if (isDbConnected()) {
    const doc = await Restaurant.findById(id).lean().catch(() => null);
    if (doc) return doc;
  }
  const found = mem.restaurants.find((r) => r._id === id);
  return found ? { ...found } : null;
}

async function countRestaurantSlotGuests(restaurantId, date, timeSlot) {
  if (isDbConnected()) {
    const rows = await RestaurantReservation.find({
      restaurantId,
      date,
      timeSlot,
      status: { $in: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.PENDING] },
    }).lean();
    return rows.reduce((s, r) => s + Number(r.guests || 0), 0);
  }
  return mem.restaurantReservations
    .filter(
      (r) =>
        r.restaurantId === restaurantId &&
        r.date === date &&
        r.timeSlot === timeSlot &&
        (r.status === BOOKING_STATUS.CONFIRMED || r.status === BOOKING_STATUS.PENDING),
    )
    .reduce((s, r) => s + Number(r.guests || 0), 0);
}

async function createRestaurantReservation(data) {
  const record = {
    bookingReference: createRef("DIN"),
    status: BOOKING_STATUS.CONFIRMED,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await RestaurantReservation.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("rres"), ...record, createdAt: now, updatedAt: now };
  mem.restaurantReservations.unshift(item);
  return { ...item };
}

async function listUserRestaurantReservations(userId) {
  if (isDbConnected()) {
    return RestaurantReservation.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.restaurantReservations
    .filter((r) => String(r.user) === String(userId))
    .map((r) => ({ ...r }));
}

async function findRestaurantReservationById(id) {
  if (isDbConnected()) {
    return RestaurantReservation.findById(id).lean().catch(() => null);
  }
  const found = mem.restaurantReservations.find((r) => r._id === id);
  return found ? { ...found } : null;
}

async function updateRestaurantReservation(id, updates) {
  if (isDbConnected()) {
    return RestaurantReservation.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.restaurantReservations.findIndex((r) => r._id === id);
  if (idx === -1) return null;
  mem.restaurantReservations[idx] = { ...mem.restaurantReservations[idx], ...updates };
  return { ...mem.restaurantReservations[idx] };
}

// ============================
// PAYMENTS, WALLET & NOTIFICATION PREFS (Modules 26, 27, 28)
// ============================
async function createPaymentTransaction(data) {
  const record = {
    invoiceNumber: createRef("INV"),
    status: PAYMENT_STATUS.ORDER_CREATED,
    ...data,
  };
  if (isDbConnected()) {
    const doc = await PaymentTransaction.create(record);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("pay"), ...record, createdAt: now, updatedAt: now };
  mem.payments.unshift(item);
  return { ...item };
}

async function findPaymentByOrderId(razorpayOrderId) {
  if (isDbConnected()) {
    return PaymentTransaction.findOne({ razorpayOrderId }).lean();
  }
  const found = mem.payments.find((p) => p.razorpayOrderId === razorpayOrderId);
  return found ? { ...found } : null;
}

async function findPaymentById(id) {
  if (isDbConnected()) {
    return PaymentTransaction.findById(id).lean().catch(() => null);
  }
  const found = mem.payments.find((p) => p._id === id);
  return found ? { ...found } : null;
}

async function updatePaymentTransaction(id, updates) {
  if (isDbConnected()) {
    return PaymentTransaction.findByIdAndUpdate(id, { $set: updates }, { new: true }).lean().catch(() => null);
  }
  const idx = mem.payments.findIndex((p) => p._id === id);
  if (idx === -1) return null;
  mem.payments[idx] = { ...mem.payments[idx], ...updates, updatedAt: new Date().toISOString() };
  return { ...mem.payments[idx] };
}

async function listUserPayments(userId) {
  if (isDbConnected()) {
    return PaymentTransaction.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.payments.filter((p) => String(p.user) === String(userId)).map((p) => ({ ...p }));
}

async function createWalletDocument(data) {
  if (isDbConnected()) {
    const doc = await WalletDocument.create(data);
    return doc.toObject();
  }
  const now = new Date().toISOString();
  const item = { _id: createId("wdoc"), ...data, createdAt: now, updatedAt: now };
  mem.walletDocuments.unshift(item);
  return { ...item };
}

async function listUserWalletDocuments(userId) {
  if (isDbConnected()) {
    return WalletDocument.find({ user: String(userId) }).sort({ createdAt: -1 }).lean();
  }
  return mem.walletDocuments.filter((d) => String(d.user) === String(userId)).map((d) => ({ ...d }));
}

async function findWalletDocumentById(id) {
  if (isDbConnected()) {
    return WalletDocument.findById(id).lean().catch(() => null);
  }
  const found = mem.walletDocuments.find((d) => d._id === id);
  return found ? { ...found } : null;
}

async function deleteWalletDocument(id) {
  if (isDbConnected()) {
    await WalletDocument.findByIdAndDelete(id).catch(() => null);
    return true;
  }
  mem.walletDocuments = mem.walletDocuments.filter((d) => d._id !== id);
  return true;
}

const DEFAULT_NOTIF_PREFS = {
  bookingConfirmations: true,
  paymentUpdates: true,
  cancellationUpdates: true,
  checkInReminders: true,
  transportReminders: true,
  activityReminders: true,
  priceAlerts: true,
};

async function getNotificationPreferences(userId) {
  if (isDbConnected()) {
    const doc = await NotificationPreference.findOne({ user: String(userId) }).lean();
    return doc || { user: String(userId), ...DEFAULT_NOTIF_PREFS };
  }
  return mem.notificationPreferences.get(String(userId)) || { user: String(userId), ...DEFAULT_NOTIF_PREFS };
}

async function upsertNotificationPreferences(userId, updates) {
  const current = await getNotificationPreferences(userId);
  const next = { ...current, ...updates, user: String(userId) };
  if (isDbConnected()) {
    return NotificationPreference.findOneAndUpdate(
      { user: String(userId) },
      { $set: next },
      { upsert: true, new: true },
    ).lean();
  }
  mem.notificationPreferences.set(String(userId), next);
  return { ...next };
}

// Helpers for reminder scheduler (scans all active upcoming reservations)
async function listAllActiveStayBookings() {
  if (isDbConnected()) {
    return StayBooking.find({ status: BOOKING_STATUS.CONFIRMED }).lean();
  }
  return mem.stayBookings.filter((b) => b.status === BOOKING_STATUS.CONFIRMED);
}

async function listAllActiveTransportReservations() {
  if (isDbConnected()) {
    return TransportReservation.find({ status: BOOKING_STATUS.CONFIRMED }).lean();
  }
  return mem.transportReservations.filter((r) => r.status === BOOKING_STATUS.CONFIRMED);
}

async function listAllActiveActivityBookings() {
  if (isDbConnected()) {
    return ActivityBooking.find({ status: BOOKING_STATUS.CONFIRMED }).lean();
  }
  return mem.activityBookings.filter((a) => a.status === BOOKING_STATUS.CONFIRMED);
}

module.exports = {
  createRef,
  createId,
  enumerateDateKeys,
  resetCommerceMemoryStore,
  listProperties,
  findPropertyById,
  createProperty,
  listRoomTypesForProperty,
  findRoomTypeById,
  createRoomType,
  updateRoomType,
  getMinAvailableRooms,
  reserveRoomInventoryAtomic,
  releaseRoomInventory,
  createStayBooking,
  listUserStayBookings,
  findStayBookingById,
  updateStayBooking,
  listStayReviews,
  findReviewByBookingId,
  createStayReview,
  findStayReviewById,
  updateStayReview,
  listBusRoutes,
  findBusRouteById,
  getBookedBusSeats,
  listCarVehicles,
  findCarVehicleById,
  createTransportReservation,
  listUserTransportReservations,
  findTransportReservationById,
  updateTransportReservation,
  listActivities,
  findActivityById,
  countActivitySlotBooked,
  createActivityBooking,
  listUserActivityBookings,
  findActivityBookingById,
  updateActivityBooking,
  listTourGuides,
  findTourGuideById,
  createGuideBooking,
  listUserGuideBookings,
  findGuideBookingById,
  updateGuideBooking,
  listGuideReviews,
  createGuideReview,
  listRestaurants,
  findRestaurantById,
  countRestaurantSlotGuests,
  createRestaurantReservation,
  listUserRestaurantReservations,
  findRestaurantReservationById,
  updateRestaurantReservation,
  createPaymentTransaction,
  findPaymentByOrderId,
  findPaymentById,
  updatePaymentTransaction,
  listUserPayments,
  createWalletDocument,
  listUserWalletDocuments,
  findWalletDocumentById,
  deleteWalletDocument,
  getNotificationPreferences,
  upsertNotificationPreferences,
  listAllActiveStayBookings,
  listAllActiveTransportReservations,
  listAllActiveActivityBookings,
};

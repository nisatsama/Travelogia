const fs = require("fs");
const path = require("path");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sanitizeString } = require("../utils/sanitize");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");
const cStore = require("../services/commerceStoreService");
const { notifyUser } = require("../services/notificationService");

const REVIEW_UPLOAD_DIR = path.resolve(__dirname, "../uploads/reviews");

function isMonthInRange(month, startMonth, endMonth) {
  if (startMonth <= endMonth) {
    return month >= startMonth && month <= endMonth;
  }
  return month >= startMonth || month <= endMonth;
}

function getNightlySeasonalRate(roomType, dateKey) {
  const month = Number(String(dateKey).slice(5, 7));
  const base = Number(roomType.basePricePerNight) || 0;
  let multiplier = 1;
  let appliedSeason = "";
  for (const rule of roomType.seasonalPricing || []) {
    if (isMonthInRange(month, Number(rule.startMonth), Number(rule.endMonth))) {
      const m = Number(rule.multiplier) || 1;
      if (m > multiplier) {
        multiplier = m;
        appliedSeason = rule.label || "Seasonal Rate";
      }
    }
  }
  return {
    dateKey,
    rate: Math.round(base * multiplier),
    multiplier,
    appliedSeason,
  };
}

function computeStayPricing(roomType, checkInDate, checkOutDate, roomsBooked) {
  const dates = cStore.enumerateDateKeys(checkInDate, checkOutDate);
  if (dates.length === 0) {
    throw new ApiError(400, "Valid checkInDate and checkOutDate (check-out after check-in) are required.");
  }
  const breakdown = dates.map((d) => getNightlySeasonalRate(roomType, d));
  const subtotal = breakdown.reduce((sum, n) => sum + n.rate * roomsBooked, 0);
  const taxAmount = Math.round(subtotal * 0.12);
  const totalAmount = subtotal + taxAmount;
  const averageNightlyRate = Math.round(subtotal / (dates.length * roomsBooked));
  return {
    nights: dates.length,
    averageNightlyRate,
    subtotal,
    taxAmount,
    totalAmount,
    currency: roomType.currency || "INR",
    nightlyBreakdown: breakdown,
  };
}

// GET /api/stays
const searchProperties = asyncHandler(async (req, res) => {
  const destination = sanitizeString(req.query.destination || req.query.city || "", 80).toLowerCase();
  const propertyType = sanitizeString(req.query.propertyType || "", 40);
  const category = sanitizeString(req.query.category || "", 40);
  const amenity = sanitizeString(req.query.amenity || "", 60).toLowerCase();
  const minPrice = req.query.minPrice ? Number(req.query.minPrice) : 0;
  const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : Number.MAX_SAFE_INTEGER;
  const minRating = req.query.minRating ? Number(req.query.minRating) : 0;
  const checkInDate = sanitizeString(req.query.checkInDate || "", 20);
  const checkOutDate = sanitizeString(req.query.checkOutDate || "", 20);
  const guests = Math.max(1, Number(req.query.guests) || 1);
  const rooms = Math.max(1, Number(req.query.rooms) || 1);

  const properties = await cStore.listProperties();
  const results = [];

  for (const prop of properties) {
    if (destination) {
      const hay = `${prop.name} ${prop.city} ${prop.state} ${prop.country}`.toLowerCase();
      if (!hay.includes(destination)) continue;
    }
    if (propertyType && propertyType !== "All" && prop.propertyType !== propertyType) continue;
    if (category && category !== "All" && prop.category !== category) continue;
    if (Number(prop.guestRating || 0) < minRating) continue;
    if (amenity) {
      const hasAmenity = (prop.amenities || []).some((a) => a.toLowerCase().includes(amenity));
      if (!hasAmenity) continue;
    }

    const roomTypes = await cStore.listRoomTypesForProperty(prop._id);
    const enrichedRooms = [];
    for (const rt of roomTypes) {
      const availableRooms =
        checkInDate && checkOutDate
          ? await cStore.getMinAvailableRooms(rt, checkInDate, checkOutDate)
          : rt.availabilityStatus === "AVAILABLE"
            ? rt.totalQuantity
            : 0;
      const sampleRate = checkInDate
        ? getNightlySeasonalRate(rt, checkInDate).rate
        : rt.basePricePerNight;
      enrichedRooms.push({
        ...rt,
        availableRooms,
        effectiveNightlyRate: sampleRate,
      });
    }

    const matchingRooms = enrichedRooms.filter(
      (r) =>
        r.effectiveNightlyRate >= minPrice &&
        r.effectiveNightlyRate <= maxPrice &&
        r.capacity * rooms >= guests &&
        r.availableRooms >= rooms,
    );

    if (
      (req.query.minPrice || req.query.maxPrice || req.query.checkInDate || req.query.guests || req.query.rooms) &&
      matchingRooms.length === 0
    ) {
      continue;
    }

    const startingPrice =
      enrichedRooms.length > 0
        ? Math.min(...enrichedRooms.map((r) => r.effectiveNightlyRate))
        : 0;

    results.push({
      ...prop,
      startingPrice,
      currency: enrichedRooms[0]?.currency || "INR",
      roomTypes: enrichedRooms,
    });
  }

  res.status(200).json({
    success: true,
    count: results.length,
    isDemoInventory: true,
    disclosure:
      "Accommodation catalogue uses Travelogia's managed inventory with real atomic room-availability and server-side seasonal pricing.",
    data: results,
  });
});

// GET /api/stays/:id
const getPropertyDetails = asyncHandler(async (req, res) => {
  const prop = await cStore.findPropertyById(req.params.id);
  if (!prop) throw new ApiError(404, "Property not found.");

  const checkInDate = sanitizeString(req.query.checkInDate || "", 20);
  const checkOutDate = sanitizeString(req.query.checkOutDate || "", 20);
  const roomTypes = await cStore.listRoomTypesForProperty(prop._id);
  const enrichedRooms = [];

  for (const rt of roomTypes) {
    const availableRooms =
      checkInDate && checkOutDate
        ? await cStore.getMinAvailableRooms(rt, checkInDate, checkOutDate)
        : rt.availabilityStatus === "AVAILABLE"
          ? rt.totalQuantity
          : 0;
    const effectiveNightlyRate = checkInDate
      ? getNightlySeasonalRate(rt, checkInDate).rate
      : rt.basePricePerNight;
    enrichedRooms.push({ ...rt, availableRooms, effectiveNightlyRate });
  }

  const reviews = await cStore.listStayReviews(prop._id, req.user?.role === "admin");

  res.status(200).json({
    success: true,
    data: {
      ...prop,
      roomTypes: enrichedRooms,
      reviews,
    },
  });
});

// POST /api/stays (property_owner / admin)
const createProperty = asyncHandler(async (req, res) => {
  const name = sanitizeString(req.body?.name || "", 140);
  const city = sanitizeString(req.body?.city || "", 80);
  const propertyType = sanitizeString(req.body?.propertyType || "Hotel", 40);
  const category = sanitizeString(req.body?.category || "Mid-Range", 40);
  if (!name || !city) {
    throw new ApiError(400, "Property name and city are required.");
  }

  const created = await cStore.createProperty({
    name,
    propertyType,
    category,
    city,
    state: sanitizeString(req.body?.state || "", 80),
    country: sanitizeString(req.body?.country || "India", 80),
    address: sanitizeString(req.body?.address || "", 200),
    description: sanitizeString(req.body?.description || "", 1200),
    images: Array.isArray(req.body?.images) ? req.body.images.slice(0, 6) : [],
    amenities: Array.isArray(req.body?.amenities)
      ? req.body.amenities.map((a) => sanitizeString(a, 50)).filter(Boolean)
      : [],
    starRating: Math.min(5, Math.max(1, Number(req.body?.starRating) || 4)),
    ownerId: req.user.id,
    hostProfile: {
      name: sanitizeString(req.body?.hostName || req.user.username || "Host", 80),
      languages: Array.isArray(req.body?.hostLanguages) ? req.body.hostLanguages : ["English"],
      responseTime: "Within 2 hours",
      verifiedHost: true,
      bio: sanitizeString(req.body?.hostBio || "", 300),
    },
    isDemoInventory: false,
  });

  res.status(201).json({ success: true, data: created });
});

// POST /api/stays/:id/rooms (property_owner / admin)
const addRoomType = asyncHandler(async (req, res) => {
  const prop = await cStore.findPropertyById(req.params.id);
  if (!prop) throw new ApiError(404, "Property not found.");
  if (req.user.role !== "admin" && String(prop.ownerId) !== String(req.user.id)) {
    throw new ApiError(403, "Only the property owner or an administrator can add room types.");
  }

  const roomCategory = sanitizeString(req.body?.roomCategory || "Deluxe", 30);
  const name = sanitizeString(req.body?.name || "", 120);
  const basePricePerNight = Number(req.body?.basePricePerNight);
  const totalQuantity = Math.max(1, Math.min(200, Number(req.body?.totalQuantity) || 1));
  const capacity = Math.max(1, Math.min(12, Number(req.body?.capacity) || 2));

  if (!name || !Number.isFinite(basePricePerNight) || basePricePerNight <= 0) {
    throw new ApiError(400, "Room name and positive basePricePerNight are required.");
  }

  const created = await cStore.createRoomType({
    propertyId: prop._id,
    roomCategory,
    name,
    capacity,
    basePricePerNight,
    currency: sanitizeString(req.body?.currency || "INR", 10),
    totalQuantity,
    amenities: Array.isArray(req.body?.amenities)
      ? req.body.amenities.map((a) => sanitizeString(a, 50)).filter(Boolean)
      : [],
    seasonalPricing: Array.isArray(req.body?.seasonalPricing) ? req.body.seasonalPricing : [],
    availabilityStatus: sanitizeString(req.body?.availabilityStatus || "AVAILABLE", 20),
  });

  res.status(201).json({ success: true, data: created });
});

// PATCH /api/stays/rooms/:roomTypeId (property_owner / admin)
const updateRoomInventoryConfig = asyncHandler(async (req, res) => {
  const roomType = await cStore.findRoomTypeById(req.params.roomTypeId);
  if (!roomType) throw new ApiError(404, "Room type not found.");
  const prop = await cStore.findPropertyById(roomType.propertyId);
  if (req.user.role !== "admin" && prop && String(prop.ownerId) !== String(req.user.id)) {
    throw new ApiError(403, "Only the property owner or an administrator can manage room inventory.");
  }

  const updates = {};
  if (req.body?.basePricePerNight !== undefined) {
    const p = Number(req.body.basePricePerNight);
    if (!Number.isFinite(p) || p <= 0) throw new ApiError(400, "basePricePerNight must be positive.");
    updates.basePricePerNight = p;
  }
  if (req.body?.totalQuantity !== undefined) {
    const q = Number(req.body.totalQuantity);
    if (!Number.isInteger(q) || q < 0 || q > 500) throw new ApiError(400, "Invalid totalQuantity.");
    updates.totalQuantity = q;
  }
  if (req.body?.availabilityStatus) {
    if (!["AVAILABLE", "LIMITED", "SOLD_OUT", "MAINTENANCE"].includes(req.body.availabilityStatus)) {
      throw new ApiError(400, "Invalid availabilityStatus.");
    }
    updates.availabilityStatus = req.body.availabilityStatus;
  }
  if (Array.isArray(req.body?.seasonalPricing)) {
    updates.seasonalPricing = req.body.seasonalPricing;
  }

  const updated = await cStore.updateRoomType(roomType._id, updates);
  res.status(200).json({ success: true, data: updated });
});

// POST /api/stays/bookings — Server-calculated pricing + atomic double-booking prevention
const createStayBooking = asyncHandler(async (req, res) => {
  const propertyId = sanitizeString(req.body?.propertyId || "", 80);
  const roomTypeId = sanitizeString(req.body?.roomTypeId || "", 80);
  const checkInDate = sanitizeString(req.body?.checkInDate || "", 20);
  const checkOutDate = sanitizeString(req.body?.checkOutDate || "", 20);
  const guests = Math.max(1, Number(req.body?.guests) || 1);
  const roomsBooked = Math.max(1, Number(req.body?.roomsBooked || req.body?.rooms) || 1);
  const tripId = sanitizeString(req.body?.tripId || "", 80);
  const specialRequests = sanitizeString(req.body?.specialRequests || "", 400);

  const prop = await cStore.findPropertyById(propertyId);
  if (!prop) throw new ApiError(404, "Selected property not found.");
  const roomType = await cStore.findRoomTypeById(roomTypeId);
  if (!roomType || String(roomType.propertyId) !== String(prop._id)) {
    throw new ApiError(404, "Selected room type does not belong to this property.");
  }

  if (guests > roomType.capacity * roomsBooked) {
    throw new ApiError(
      400,
      `Guest count (${guests}) exceeds selected room capacity (${roomType.capacity * roomsBooked}). Please book additional rooms.`,
    );
  }

  // Server-side authoritative pricing (completely ignores any frontend-submitted price/total)
  const pricing = computeStayPricing(roomType, checkInDate, checkOutDate, roomsBooked);

  // Atomic inventory reservation across all nights (prevents double-booking under concurrency)
  const reservation = await cStore.reserveRoomInventoryAtomic(
    roomType,
    checkInDate,
    checkOutDate,
    roomsBooked,
  );
  if (!reservation.ok) {
    throw new ApiError(409, reservation.reason);
  }

  const booking = await cStore.createStayBooking({
    user: req.user.id,
    tripId,
    propertyId: prop._id,
    propertyName: prop.name,
    propertyType: prop.propertyType,
    city: prop.city,
    roomTypeId: roomType._id,
    roomTypeName: roomType.name,
    roomCategory: roomType.roomCategory,
    checkInDate,
    checkOutDate,
    nights: pricing.nights,
    guests,
    roomsBooked,
    nightlyRateApplied: pricing.averageNightlyRate,
    subtotal: pricing.subtotal,
    taxAmount: pricing.taxAmount,
    totalAmount: pricing.totalAmount,
    currency: pricing.currency,
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
    specialRequests,
  });

  // Auto-add confirmation to Digital Travel Wallet
  await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category: "HOTEL_CONFIRMATION",
    title: `${prop.name} (${roomType.name})`,
    referenceCode: booking.bookingReference,
    referenceOrigin: "internal-booking",
    providerName: prop.name,
    eventDate: checkInDate,
    notes: `${pricing.nights} night(s), ${roomsBooked} room(s), ${guests} guest(s) · Total ${pricing.currency} ${pricing.totalAmount}`,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Stay Confirmed: ${prop.name}`,
    message: `Booking ${booking.bookingReference} for ${checkInDate} to ${checkOutDate} (${pricing.currency} ${pricing.totalAmount}).`,
    relatedId: booking._id,
  });

  res.status(201).json({
    success: true,
    message: "Accommodation reservation confirmed with atomic room inventory lock.",
    data: booking,
    pricingBreakdown: pricing.nightlyBreakdown,
  });
});

// GET /api/stays/bookings/mine
const listMyStayBookings = asyncHandler(async (req, res) => {
  const rows = await cStore.listUserStayBookings(req.user.id);
  res.status(200).json({ success: true, count: rows.length, data: rows });
});

// PATCH /api/stays/bookings/:bookingId/cancel
const cancelStayBooking = asyncHandler(async (req, res) => {
  const booking = await cStore.findStayBookingById(req.params.bookingId);
  if (!booking) throw new ApiError(404, "Stay booking not found.");
  if (req.user.role !== "admin" && String(booking.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only cancel your own stay bookings.");
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw new ApiError(409, "This stay booking is already cancelled.");
  }
  if (booking.status === BOOKING_STATUS.COMPLETED) {
    throw new ApiError(409, "Completed stays cannot be cancelled.");
  }

  await cStore.releaseRoomInventory(
    booking.roomTypeId,
    booking.checkInDate,
    booking.checkOutDate,
    booking.roomsBooked,
  );

  const updated = await cStore.updateStayBooking(booking._id, {
    status: BOOKING_STATUS.CANCELLED,
    cancelledAt: new Date().toISOString(),
  });

  await notifyUser({
    userId: booking.user,
    type: "cancellation-update",
    title: `Stay Cancelled: ${booking.propertyName}`,
    message: `Reservation ${booking.bookingReference} was cancelled and ${booking.roomsBooked} room(s) were returned to inventory.`,
    relatedId: booking._id,
  });

  res.status(200).json({
    success: true,
    message: "Stay booking cancelled and room inventory restored.",
    data: updated,
  });
});

// PATCH /api/stays/bookings/:bookingId/complete — Marks a stay COMPLETED (enables verified reviews)
const completeStayBooking = asyncHandler(async (req, res) => {
  const booking = await cStore.findStayBookingById(req.params.bookingId);
  if (!booking) throw new ApiError(404, "Stay booking not found.");
  const isOwnerOrStaff =
    String(booking.user) === String(req.user.id) ||
    req.user.role === "admin" ||
    req.user.role === "property_owner";
  if (!isOwnerOrStaff) {
    throw new ApiError(403, "Not authorized to update this stay status.");
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw new ApiError(409, "Cancelled bookings cannot be marked completed.");
  }

  const updated = await cStore.updateStayBooking(booking._id, {
    status: BOOKING_STATUS.COMPLETED,
    completedAt: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    message: "Stay marked as completed. Verified review is now unlocked.",
    data: updated,
  });
});

// POST /api/stays/:id/reviews — Module 16: Verified completed stays ONLY
const submitStayReview = asyncHandler(async (req, res) => {
  const propertyId = req.params.id;
  const prop = await cStore.findPropertyById(propertyId);
  if (!prop) throw new ApiError(404, "Property not found.");

  const userBookings = await cStore.listUserStayBookings(req.user.id);
  const requestedBookingId = sanitizeString(req.body?.bookingId || "", 80);

  const qualifying = userBookings.find(
    (b) =>
      String(b.propertyId) === String(propertyId) &&
      b.status === BOOKING_STATUS.COMPLETED &&
      (!requestedBookingId || String(b._id) === requestedBookingId),
  );

  if (!qualifying) {
    throw new ApiError(
      403,
      "Only guests with a verified COMPLETED stay at this property can submit a review.",
    );
  }

  const duplicate = await cStore.findReviewByBookingId(qualifying._id);
  if (duplicate) {
    throw new ApiError(409, "You have already reviewed this completed stay.");
  }

  const overallRating = Number(req.body?.overallRating);
  const cleanlinessScore = Number(req.body?.cleanlinessScore);
  const locationScore = Number(req.body?.locationScore);
  const serviceScore = Number(req.body?.serviceScore);
  const comment = sanitizeString(req.body?.comment || "", 1500);

  for (const [label, val] of [
    ["overallRating", overallRating],
    ["cleanlinessScore", cleanlinessScore],
    ["locationScore", locationScore],
    ["serviceScore", serviceScore],
  ]) {
    if (!Number.isFinite(val) || val < 1 || val > 5) {
      throw new ApiError(400, `${label} must be a number between 1 and 5.`);
    }
  }
  if (comment.length < 10) {
    throw new ApiError(400, "Written review must be at least 10 characters.");
  }

  const photos = [];
  if (Array.isArray(req.files) && req.files.length > 0) {
    req.files.slice(0, 4).forEach((f) => {
      photos.push(`/api/stays/review-photo/${f.filename}`);
    });
  }

  const review = await cStore.createStayReview({
    propertyId: prop._id,
    bookingId: qualifying._id,
    user: req.user.id,
    authorName: req.user.username || "Verified Guest",
    overallRating,
    cleanlinessScore,
    locationScore,
    serviceScore,
    comment,
    photos,
    verifiedStay: true,
    moderationStatus: "APPROVED",
  });

  res.status(201).json({
    success: true,
    message: "Verified stay review published.",
    data: review,
  });
});

// GET /api/stays/review-photo/:filename
const serveReviewPhoto = asyncHandler(async (req, res) => {
  const filename = String(req.params.filename || "");
  if (!/^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    throw new ApiError(400, "Invalid photo filename.");
  }
  const resolved = path.resolve(REVIEW_UPLOAD_DIR, filename);
  if (!resolved.startsWith(REVIEW_UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    throw new ApiError(404, "Review photo not found.");
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  return res.sendFile(resolved);
});

// PATCH /api/stays/reviews/:reviewId/respond (property_owner / admin)
const respondToStayReview = asyncHandler(async (req, res) => {
  const review = await cStore.findStayReviewById(req.params.reviewId);
  if (!review) throw new ApiError(404, "Review not found.");
  const message = sanitizeString(req.body?.message || "", 1000);
  if (!message) throw new ApiError(400, "Owner response message is required.");

  const updated = await cStore.updateStayReview(review._id, {
    ownerResponse: {
      message,
      respondedBy: req.user.username || req.user.id,
      respondedAt: new Date().toISOString(),
    },
  });

  res.status(200).json({ success: true, data: updated });
});

// PATCH /api/stays/reviews/:reviewId/moderate (admin)
const moderateStayReview = asyncHandler(async (req, res) => {
  const status = sanitizeString(req.body?.moderationStatus || "", 20);
  if (!["APPROVED", "FLAGGED", "HIDDEN"].includes(status)) {
    throw new ApiError(400, "moderationStatus must be APPROVED, FLAGGED, or HIDDEN.");
  }
  const updated = await cStore.updateStayReview(req.params.reviewId, {
    moderationStatus: status,
  });
  if (!updated) throw new ApiError(404, "Review not found.");
  res.status(200).json({ success: true, data: updated });
});

module.exports = {
  REVIEW_UPLOAD_DIR,
  searchProperties,
  getPropertyDetails,
  createProperty,
  addRoomType,
  updateRoomInventoryConfig,
  createStayBooking,
  listMyStayBookings,
  cancelStayBooking,
  completeStayBooking,
  submitStayReview,
  serveReviewPhoto,
  respondToStayReview,
  moderateStayReview,
};

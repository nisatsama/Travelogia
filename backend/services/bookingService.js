const ApiError = require("../utils/ApiError");
const store = require("./storeService");
const { calculateBookingPricing, generateBookingReference } = require("./pricingService");

// In-process per-destination-date lock queue to prevent concurrent overbooking races
const bookingLocks = new Map();

async function withBookingLock(lockKey, task) {
  const prev = bookingLocks.get(lockKey) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  bookingLocks.set(lockKey, prev.then(() => next));
  await prev;
  try {
    return await task();
  } finally {
    release();
    if (bookingLocks.get(lockKey) === next) {
      bookingLocks.delete(lockKey);
    }
  }
}

async function createBooking({ userId, travelId, travelers, duration, startDate, idempotencyKey }) {
  const travel = await store.findTravelById(travelId);
  if (!travel || travel.isArchived) {
    throw new ApiError(404, "Selected destination does not exist or is no longer available.");
  }
  if (travel.isAvailable === false) {
    throw new ApiError(400, "This destination is currently unavailable for booking.");
  }

  // Prevent booking dates in the past (allow today UTC)
  const parsedDate = new Date(startDate);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new ApiError(400, "Please select a valid travel date.");
  }
  const todayUtc = new Date();
  todayUtc.setUTCHours(0, 0, 0, 0);
  const startUtc = new Date(parsedDate);
  startUtc.setUTCHours(0, 0, 0, 0);
  if (startUtc < todayUtc) {
    throw new ApiError(400, "Travel date cannot be in the past.");
  }

  const maxDate = new Date(todayUtc);
  maxDate.setUTCFullYear(maxDate.getUTCFullYear() + 2);
  if (startUtc > maxDate) {
    throw new ApiError(400, "Travel date cannot be more than 2 years in the future.");
  }

  // Server-side trusted price calculation — client totalCost is completely ignored
  const pricing = calculateBookingPricing({
    travel,
    travelers,
    duration,
    startDate: parsedDate,
  });

  const lockKey = `${travel._id}:${startUtc.toISOString().slice(0, 10)}`;

  return withBookingLock(lockKey, async () => {
    // Duplicate submission protection
    const existingDuplicate = await store.findRecentDuplicateBooking({
      userId,
      travelId: travel._id,
      startDate: pricing.startDate,
      duration: pricing.duration,
      travelers: pricing.travelers,
      idempotencyKey,
    });
    if (existingDuplicate) {
      throw new ApiError(
        409,
        "A matching booking was just submitted. Please check your bookings before retrying.",
      );
    }

    // Capacity enforcement
    const maxCapacity = Number(travel.maxCapacity || 20);
    const alreadyBooked = await store.countBookedTravelersForDate(
      travel._id,
      pricing.startDate,
    );
    if (alreadyBooked + pricing.travelers > maxCapacity) {
      const remaining = Math.max(0, maxCapacity - alreadyBooked);
      throw new ApiError(
        409,
        `Not enough availability for this date. Remaining slots: ${remaining}.`,
      );
    }

    const booking = await store.createBookingRecord({
      bookingReference: generateBookingReference(),
      user: userId,
      travel: travel._id,
      destination: travel.title,
      travelers: pricing.travelers,
      duration: pricing.duration,
      pricePerNight: pricing.pricePerNight,
      totalCost: pricing.totalCost,
      currency: pricing.currency,
      startDate: pricing.startDate,
      endDate: pricing.endDate,
      date: pricing.startDate,
      status: "confirmed",
      paymentStatus: "reserved_no_payment",
      idempotencyKey: idempotencyKey || null,
    });

    return booking;
  });
}

async function cancelBooking({ bookingId, requesterId, requesterRole }) {
  const booking = await store.findBookingById(bookingId);
  if (!booking) {
    throw new ApiError(404, "Booking not found.");
  }

  const bookingOwnerId =
    typeof booking.user === "object" && booking.user !== null
      ? String(booking.user._id || booking.user)
      : String(booking.user);

  if (requesterRole !== "admin" && bookingOwnerId !== String(requesterId)) {
    throw new ApiError(403, "You are not authorized to cancel this booking.");
  }

  if (booking.status === "cancelled") {
    throw new ApiError(400, "This booking is already cancelled.");
  }

  if (booking.status === "completed") {
    throw new ApiError(400, "Completed trips cannot be cancelled.");
  }

  return store.cancelBookingRecord(bookingId);
}

module.exports = {
  createBooking,
  cancelBooking,
};

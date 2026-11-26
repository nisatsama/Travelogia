const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sanitizeString } = require("../utils/sanitize");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");
const cStore = require("../services/commerceStoreService");
const { notifyUser } = require("../services/notificationService");

// ============================
// MODULE 22 — ACTIVITIES & EXPERIENCES BOOKING
// ============================
const listActivities = asyncHandler(async (req, res) => {
  const city = sanitizeString(req.query.city || "", 60).toLowerCase();
  const category = sanitizeString(req.query.category || "", 50);
  const maxPrice = req.query.maxPrice ? Number(req.query.maxPrice) : Number.MAX_SAFE_INTEGER;
  const date =
    sanitizeString(req.query.date || "", 20) ||
    new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

  const items = await cStore.listActivities();
  const filtered = items.filter((a) => {
    if (city && !`${a.city} ${a.title}`.toLowerCase().includes(city)) return false;
    if (category && category !== "All" && a.category !== category) return false;
    if (Number(a.pricePerPerson) > maxPrice) return false;
    return true;
  });

  const enriched = [];
  for (const a of filtered) {
    const slotAvailability = [];
    for (const slot of a.timeSlots || []) {
      const booked = await cStore.countActivitySlotBooked(a._id, date, slot);
      slotAvailability.push({
        slot,
        maxCapacity: a.maxCapacityPerSlot,
        booked,
        remaining: Math.max(0, a.maxCapacityPerSlot - booked),
      });
    }
    enriched.push({ ...a, date, slotAvailability });
  }

  res.status(200).json({
    success: true,
    isDemoInventory: true,
    count: enriched.length,
    data: enriched,
  });
});

const bookActivity = asyncHandler(async (req, res) => {
  const activityId = sanitizeString(req.body?.activityId || "", 80);
  const date = sanitizeString(req.body?.date || "", 20);
  const timeSlot = sanitizeString(req.body?.timeSlot || "", 20);
  const participants = Math.max(1, Number(req.body?.participants) || 1);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!activityId || !date || !timeSlot) {
    throw new ApiError(400, "activityId, date, and timeSlot are required.");
  }

  const activity = await cStore.findActivityById(activityId);
  if (!activity) throw new ApiError(404, "Activity not found.");
  if (!(activity.timeSlots || []).includes(timeSlot)) {
    throw new ApiError(400, `Selected timeSlot '${timeSlot}' is not offered for this activity.`);
  }

  // Prevent overbooking
  const alreadyBooked = await cStore.countActivitySlotBooked(activity._id, date, timeSlot);
  if (alreadyBooked + participants > activity.maxCapacityPerSlot) {
    throw new ApiError(
      409,
      `Only ${Math.max(0, activity.maxCapacityPerSlot - alreadyBooked)} spot(s) left for ${timeSlot} on ${date}.`,
    );
  }

  const totalAmount = Number(activity.pricePerPerson) * participants;

  const booking = await cStore.createActivityBooking({
    user: req.user.id,
    tripId,
    activityId: activity._id,
    activityTitle: activity.title,
    category: activity.category,
    city: activity.city,
    date,
    timeSlot,
    participants,
    pricePerPerson: activity.pricePerPerson,
    totalAmount,
    currency: activity.currency || "INR",
    status: BOOKING_STATUS.CONFIRMED,
    paymentStatus: PAYMENT_STATUS.UNPAID,
  });

  await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category: "ACTIVITY_BOOKING",
    title: `${activity.title} (${timeSlot})`,
    referenceCode: booking.bookingReference,
    referenceOrigin: "internal-booking",
    providerName: activity.providerName,
    eventDate: date,
    notes: `${participants} participant(s) · Total ${booking.currency} ${totalAmount}`,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Activity Confirmed: ${activity.title}`,
    message: `Booked for ${date} at ${timeSlot} (${participants} participant(s), ${booking.bookingReference}).`,
    relatedId: booking._id,
  });

  res.status(201).json({ success: true, message: "Activity reservation confirmed.", data: booking });
});

const listMyActivityBookings = asyncHandler(async (req, res) => {
  const data = await cStore.listUserActivityBookings(req.user.id);
  res.status(200).json({ success: true, count: data.length, data });
});

const cancelActivityBooking = asyncHandler(async (req, res) => {
  const booking = await cStore.findActivityBookingById(req.params.id);
  if (!booking) throw new ApiError(404, "Activity booking not found.");
  if (req.user.role !== "admin" && String(booking.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only cancel your own activity bookings.");
  }
  if (booking.status === BOOKING_STATUS.CANCELLED) {
    throw new ApiError(409, "Activity booking is already cancelled.");
  }

  const updated = await cStore.updateActivityBooking(booking._id, {
    status: BOOKING_STATUS.CANCELLED,
  });

  await notifyUser({
    userId: booking.user,
    type: "cancellation-update",
    title: `Activity Cancelled: ${booking.activityTitle}`,
    message: `Booking ${booking.bookingReference} was cancelled and capacity restored.`,
    relatedId: booking._id,
  });

  res.status(200).json({ success: true, data: updated });
});

// ============================
// MODULE 23 — LOCAL TOUR GUIDE MARKETPLACE
// ============================
const listTourGuides = asyncHandler(async (req, res) => {
  const city = sanitizeString(req.query.city || "", 60).toLowerCase();
  const language = sanitizeString(req.query.language || "", 40).toLowerCase();
  const expertise = sanitizeString(req.query.expertise || "", 60).toLowerCase();

  const guides = await cStore.listTourGuides();
  const filtered = guides.filter((g) => {
    if (city && !`${g.city} ${g.region}`.toLowerCase().includes(city)) return false;
    if (language && !(g.languages || []).some((l) => l.toLowerCase().includes(language))) return false;
    if (expertise && !(g.expertise || []).some((e) => e.toLowerCase().includes(expertise))) return false;
    return true;
  });

  const enriched = [];
  for (const g of filtered) {
    const reviews = await cStore.listGuideReviews(g._id);
    enriched.push({ ...g, reviews });
  }

  res.status(200).json({ success: true, count: enriched.length, data: enriched });
});

const requestGuideBooking = asyncHandler(async (req, res) => {
  const guideId = sanitizeString(req.body?.guideId || "", 80);
  const startDate = sanitizeString(req.body?.startDate || "", 20);
  const days = Math.max(1, Math.min(21, Number(req.body?.days) || 1));
  const languageRequested = sanitizeString(req.body?.languageRequested || "English", 40);
  const notes = sanitizeString(req.body?.notes || "", 400);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!guideId || !startDate) {
    throw new ApiError(400, "guideId and startDate are required.");
  }
  const guide = await cStore.findTourGuideById(guideId);
  if (!guide) throw new ApiError(404, "Tour guide not found.");

  const totalAmount = Number(guide.pricePerDay) * days;

  const booking = await cStore.createGuideBooking({
    user: req.user.id,
    tripId,
    guideId: guide._id,
    guideName: guide.name,
    city: guide.city,
    startDate,
    days,
    languageRequested,
    notes,
    totalAmount,
    currency: guide.currency || "INR",
    status: BOOKING_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.UNPAID,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Guide Request Sent: ${guide.name}`,
    message: `Request ${booking.bookingReference} for ${days} day(s) starting ${startDate} (${booking.currency} ${totalAmount}).`,
    relatedId: booking._id,
  });

  res.status(201).json({ success: true, message: "Tour guide booking request created.", data: booking });
});

const listMyGuideBookings = asyncHandler(async (req, res) => {
  const data = await cStore.listUserGuideBookings(req.user.id);
  res.status(200).json({ success: true, count: data.length, data });
});

const updateGuideBookingStatus = asyncHandler(async (req, res) => {
  const booking = await cStore.findGuideBookingById(req.params.id);
  if (!booking) throw new ApiError(404, "Guide booking not found.");
  const nextStatus = sanitizeString(req.body?.status || "", 20);
  if (![BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.COMPLETED, BOOKING_STATUS.CANCELLED].includes(nextStatus)) {
    throw new ApiError(400, "Status must be CONFIRMED, COMPLETED, or CANCELLED.");
  }

  const isCustomer = String(booking.user) === String(req.user.id);
  const isGuideOrAdmin = req.user.role === "admin" || req.user.role === "tour_guide";
  if (!isCustomer && !isGuideOrAdmin) {
    throw new ApiError(403, "Not authorized to update this guide booking.");
  }
  if (nextStatus === BOOKING_STATUS.CONFIRMED && !isGuideOrAdmin && !isCustomer) {
    throw new ApiError(403, "Only the tour guide or administrator can confirm requests.");
  }

  const updated = await cStore.updateGuideBooking(booking._id, { status: nextStatus });
  res.status(200).json({ success: true, data: updated });
});

const submitGuideReview = asyncHandler(async (req, res) => {
  const guideId = req.params.id;
  const guide = await cStore.findTourGuideById(guideId);
  if (!guide) throw new ApiError(404, "Tour guide not found.");

  const userBookings = await cStore.listUserGuideBookings(req.user.id);
  const completed = userBookings.find(
    (b) => String(b.guideId) === String(guideId) && b.status === BOOKING_STATUS.COMPLETED,
  );
  if (!completed) {
    throw new ApiError(403, "Only travellers with a COMPLETED booking for this guide can submit a verified review.");
  }

  const rating = Number(req.body?.rating);
  const comment = sanitizeString(req.body?.comment || "", 1000);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5 || comment.length < 8) {
    throw new ApiError(400, "Rating (1–5) and a comment of at least 8 characters are required.");
  }

  const review = await cStore.createGuideReview({
    guideId: guide._id,
    bookingId: completed._id,
    user: req.user.id,
    authorName: req.user.username || "Verified Traveller",
    rating,
    comment,
  });

  res.status(201).json({ success: true, data: review });
});

// ============================
// MODULE 24 — RESTAURANT DISCOVERY & RESERVATIONS
// ============================
const listRestaurants = asyncHandler(async (req, res) => {
  const city = sanitizeString(req.query.city || "", 60).toLowerCase();
  const cuisine = sanitizeString(req.query.cuisine || "", 50).toLowerCase();
  const priceTier = sanitizeString(req.query.priceTier || "", 10);
  const date =
    sanitizeString(req.query.date || "", 20) ||
    new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const items = await cStore.listRestaurants();
  const filtered = items.filter((r) => {
    if (city && !`${r.city} ${r.name}`.toLowerCase().includes(city)) return false;
    if (cuisine && !(r.cuisines || []).some((c) => c.toLowerCase().includes(cuisine))) return false;
    if (priceTier && priceTier !== "All" && r.priceTier !== priceTier) return false;
    return true;
  });

  const enriched = [];
  for (const r of filtered) {
    const slotAvailability = [];
    for (const s of r.timeSlots || []) {
      const bookedGuests = await cStore.countRestaurantSlotGuests(r._id, date, s.slot);
      slotAvailability.push({
        slot: s.slot,
        maxSeats: s.maxSeats,
        bookedGuests,
        remainingSeats: Math.max(0, s.maxSeats - bookedGuests),
      });
    }
    enriched.push({ ...r, date, slotAvailability });
  }

  res.status(200).json({
    success: true,
    isDemoInventory: true,
    count: enriched.length,
    data: enriched,
  });
});

const reserveRestaurantTable = asyncHandler(async (req, res) => {
  const restaurantId = sanitizeString(req.body?.restaurantId || "", 80);
  const date = sanitizeString(req.body?.date || "", 20);
  const timeSlot = sanitizeString(req.body?.timeSlot || "", 20);
  const guests = Math.max(1, Math.min(20, Number(req.body?.guests) || 2));
  const dietaryNotes = sanitizeString(req.body?.dietaryNotes || "", 300);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!restaurantId || !date || !timeSlot) {
    throw new ApiError(400, "restaurantId, date, and timeSlot are required.");
  }

  const restaurant = await cStore.findRestaurantById(restaurantId);
  if (!restaurant) throw new ApiError(404, "Restaurant not found.");

  // Confirm ONLY against actual configured restaurant slot capacity
  const configuredSlot = (restaurant.timeSlots || []).find((s) => s.slot === timeSlot);
  if (!configuredSlot) {
    throw new ApiError(400, `Time slot '${timeSlot}' is not configured for ${restaurant.name}.`);
  }

  const bookedGuests = await cStore.countRestaurantSlotGuests(restaurant._id, date, timeSlot);
  if (bookedGuests + guests > configuredSlot.maxSeats) {
    throw new ApiError(
      409,
      `Insufficient table capacity at ${timeSlot} on ${date}. Remaining seats: ${Math.max(0, configuredSlot.maxSeats - bookedGuests)}.`,
    );
  }

  const reservation = await cStore.createRestaurantReservation({
    user: req.user.id,
    tripId,
    restaurantId: restaurant._id,
    restaurantName: restaurant.name,
    city: restaurant.city,
    date,
    timeSlot,
    guests,
    dietaryNotes,
    status: BOOKING_STATUS.CONFIRMED,
  });

  await notifyUser({
    userId: req.user.id,
    type: "booking-confirmation",
    title: `Table Reserved: ${restaurant.name}`,
    message: `Table for ${guests} confirmed on ${date} at ${timeSlot} (${reservation.bookingReference}).`,
    relatedId: reservation._id,
  });

  res.status(201).json({ success: true, message: "Restaurant table confirmed.", data: reservation });
});

const listMyRestaurantReservations = asyncHandler(async (req, res) => {
  const data = await cStore.listUserRestaurantReservations(req.user.id);
  res.status(200).json({ success: true, count: data.length, data });
});

const cancelRestaurantReservation = asyncHandler(async (req, res) => {
  const reservation = await cStore.findRestaurantReservationById(req.params.id);
  if (!reservation) throw new ApiError(404, "Restaurant reservation not found.");
  if (req.user.role !== "admin" && String(reservation.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only cancel your own restaurant reservations.");
  }
  const updated = await cStore.updateRestaurantReservation(reservation._id, {
    status: BOOKING_STATUS.CANCELLED,
  });
  res.status(200).json({ success: true, data: updated });
});

module.exports = {
  listActivities,
  bookActivity,
  listMyActivityBookings,
  cancelActivityBooking,
  listTourGuides,
  requestGuideBooking,
  listMyGuideBookings,
  updateGuideBookingStatus,
  submitGuideReview,
  listRestaurants,
  reserveRestaurantTable,
  listMyRestaurantReservations,
  cancelRestaurantReservation,
};

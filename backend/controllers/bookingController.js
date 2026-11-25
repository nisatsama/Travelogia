const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");
const bookingService = require("../services/bookingService");

// POST /api/bookings
const createBooking = asyncHandler(async (req, res) => {
  const booking = await bookingService.createBooking({
    userId: req.user.id,
    ...req.validated,
  });

  res.status(201).json({
    success: true,
    message: "Booking confirmed successfully.",
    booking,
  });
});

// GET /api/bookings
const getMyBookings = asyncHandler(async (req, res) => {
  const bookings = await store.listUserBookings(req.user.id);
  res.status(200).json({
    success: true,
    data: bookings,
  });
});

// GET /api/bookings/:id
const getBookingById = asyncHandler(async (req, res) => {
  const booking = await store.findBookingById(req.params.id);
  if (!booking) {
    throw new ApiError(404, "Booking not found.");
  }

  const ownerId =
    typeof booking.user === "object" && booking.user !== null
      ? String(booking.user._id || booking.user)
      : String(booking.user);

  if (req.user.role !== "admin" && ownerId !== String(req.user.id)) {
    throw new ApiError(403, "You are not authorized to view this booking.");
  }

  res.status(200).json({
    success: true,
    data: booking,
  });
});

// PATCH /api/bookings/:id/cancel
const cancelBooking = asyncHandler(async (req, res) => {
  const updated = await bookingService.cancelBooking({
    bookingId: req.params.id,
    requesterId: req.user.id,
    requesterRole: req.user.role,
  });

  res.status(200).json({
    success: true,
    message: "Booking cancelled successfully.",
    booking: updated,
  });
});

module.exports = {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
};

const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");

// GET /api/profile
const getProfile = asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const [bookings, favorites] = await Promise.all([
    store.listUserBookings(req.user.id),
    store.listUserFavorites(req.user.id),
  ]);

  const now = new Date();
  const confirmedBookings = bookings.filter((b) => b.status === "confirmed");
  const upcomingTrips = confirmedBookings.filter(
    (b) => b.startDate && new Date(b.startDate) >= now,
  ).length;
  const uniqueCountries = new Set(
    confirmedBookings
      .map((b) => b.travel?.country)
      .filter(Boolean),
  ).size;

  // Real database-derived statistics only — zero fabricated stats
  res.status(200).json({
    success: true,
    user,
    bookings,
    favorites,
    stats: {
      tripsBooked: confirmedBookings.length,
      totalBookings: bookings.length,
      upcomingTrips,
      wishlistItems: favorites.length,
      countriesBooked: uniqueCountries,
    },
  });
});

// PUT /api/profile — Edit Profile (strict field allowlist, never modifies role)
const updateProfile = asyncHandler(async (req, res) => {
  const updatedUser = await store.updateUserProfile(req.user.id, req.validated);
  res.status(200).json({
    success: true,
    message: "Profile updated successfully.",
    user: updatedUser,
  });
});

module.exports = {
  getProfile,
  updateProfile,
};

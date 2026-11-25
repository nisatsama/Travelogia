const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");
const { sanitizeString } = require("../utils/sanitize");

// GET /api/favorites
const getFavorites = asyncHandler(async (req, res) => {
  const favorites = await store.listUserFavorites(req.user.id);
  res.status(200).json({
    success: true,
    data: favorites,
  });
});

// POST /api/favorites
const addFavorite = asyncHandler(async (req, res) => {
  const travelId = sanitizeString(req.body?.travelId || req.body?.travel, 120);
  if (!travelId) {
    throw new ApiError(400, "travelId is required.");
  }
  const favorite = await store.addFavoriteRecord(req.user.id, travelId);
  res.status(201).json({
    success: true,
    message: "Added to favorites.",
    data: favorite,
  });
});

// DELETE /api/favorites/:id
const removeFavorite = asyncHandler(async (req, res) => {
  await store.removeFavoriteRecord(req.user.id, req.params.id);
  res.status(200).json({
    success: true,
    message: "Removed from favorites.",
  });
});

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite,
};

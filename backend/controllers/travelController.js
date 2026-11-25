const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sanitizeString } = require("../utils/sanitize");

// GET /api/travels
const getTravels = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);

  const search = sanitizeString(req.query.search || "", 120);
  const category = sanitizeString(req.query.category || "", 60);
  const country = sanitizeString(req.query.country || "", 80);
  const region = sanitizeString(req.query.region || "", 80);
  const sortBy = sanitizeString(req.query.sortBy || "createdAt", 40);
  const sortOrder = sanitizeString(req.query.sortOrder || "desc", 10);

  const TRI = new Set(["yes", "no", "unknown"]);
  const WALK = new Set(["low", "moderate", "high", "unknown"]);
  const pickTri = (v) => (v && TRI.has(String(v).toLowerCase()) ? String(v).toLowerCase() : undefined);
  const wheelchairAccessible = pickTri(req.query.wheelchairAccessible);
  const accessibleAccommodation = pickTri(req.query.accessibleAccommodation);
  const publicTransport = pickTri(req.query.publicTransport);
  const familyFriendly = pickTri(req.query.familyFriendly);
  const accessibleAttractions = pickTri(req.query.accessibleAttractions);
  const walkingIntensity =
    req.query.walkingIntensity && WALK.has(String(req.query.walkingIntensity).toLowerCase())
      ? String(req.query.walkingIntensity).toLowerCase()
      : undefined;

  const minPrice = req.query.minPrice !== undefined && req.query.minPrice !== ""
    ? Number(req.query.minPrice)
    : undefined;
  const maxPrice = req.query.maxPrice !== undefined && req.query.maxPrice !== ""
    ? Number(req.query.maxPrice)
    : undefined;
  const minRating = req.query.minRating !== undefined && req.query.minRating !== ""
    ? Number(req.query.minRating)
    : undefined;

  if (minPrice !== undefined && (!Number.isFinite(minPrice) || minPrice < 0)) {
    throw new ApiError(400, "minPrice must be a non-negative number.");
  }
  if (maxPrice !== undefined && (!Number.isFinite(maxPrice) || maxPrice < 0)) {
    throw new ApiError(400, "maxPrice must be a non-negative number.");
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new ApiError(400, "minPrice cannot exceed maxPrice.");
  }
  if (minRating !== undefined && (!Number.isFinite(minRating) || minRating < 0 || minRating > 5)) {
    throw new ApiError(400, "minRating must be between 0 and 5.");
  }

  const featured = req.query.featured === "true" ? true : undefined;
  const isHiddenGem = req.query.isHiddenGem === "true" ? true : undefined;

  const { items, total } = await store.listTravels({
    skip,
    limit,
    search,
    category,
    country,
    region,
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
    sortBy,
    sortOrder,
  });

  res.status(200).json({
    success: true,
    data: items,
    pagination: buildPaginationMeta(page, limit, total),
  });
});

// GET /api/travels/facets
const getTravelFacets = asyncHandler(async (req, res) => {
  const facets = await store.getTravelFacets();
  res.status(200).json({
    success: true,
    data: facets,
    ...facets,
  });
});

// GET /api/travels/:id
const getTravelById = asyncHandler(async (req, res) => {
  const travel = await store.findTravelById(req.params.id);
  if (!travel || travel.isArchived) {
    throw new ApiError(404, "Destination not found.");
  }
  res.status(200).json({
    success: true,
    data: travel,
  });
});

// POST /api/travels (Admin only)
const createTravel = asyncHandler(async (req, res) => {
  const created = await store.createTravel(req.validated, req.user.id);
  res.status(201).json({
    success: true,
    message: "Destination created successfully.",
    data: created,
  });
});

// PUT /api/travels/:id (Admin only)
const updateTravel = asyncHandler(async (req, res) => {
  const updated = await store.updateTravel(req.params.id, req.validated);
  res.status(200).json({
    success: true,
    message: "Destination updated successfully.",
    data: updated,
  });
});

// DELETE /api/travels/:id (Admin only — archives safely if bookings exist)
const deleteTravel = asyncHandler(async (req, res) => {
  const result = await store.deleteOrArchiveTravel(req.params.id);
  res.status(200).json({
    success: true,
    action: result.action,
    message:
      result.action === "archived"
        ? "Destination has existing bookings and was archived safely to preserve history."
        : "Destination deleted successfully.",
    data: result.destination,
  });
});

// POST /api/travels/:id/accessibility (Authenticated — clearly labelled user-submitted or verified for admins)
const updateTravelAccessibility = asyncHandler(async (req, res) => {
  const source = req.user?.role === "admin" ? "verified" : "user-submitted";
  const updated = await store.updateTravelAccessibility(req.params.id, req.body || {}, source);
  res.status(200).json({
    success: true,
    message:
      source === "verified"
        ? "Accessibility profile updated as verified."
        : "Thank you — your accessibility report was saved as user-submitted.",
    data: updated,
  });
});

module.exports = {
  getTravels,
  getTravelFacets,
  getTravelById,
  createTravel,
  updateTravel,
  deleteTravel,
  updateTravelAccessibility,
};

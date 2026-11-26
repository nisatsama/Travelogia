const bcrypt = require("bcryptjs");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");
const { parsePagination, buildPaginationMeta } = require("../utils/pagination");
const { sanitizeString } = require("../utils/sanitize");

// GET /api/admin/overview
const getAdminOverview = asyncHandler(async (req, res) => {
  const [travelsRes, bookingsRes, usersRes] = await Promise.all([
    store.listTravels({ limit: 50, skip: 0, includeArchived: true, includeUnavailable: true }),
    store.listAllBookings({ limit: 50, skip: 0 }),
    store.listUsers({ limit: 50, skip: 0 }),
  ]);

  res.status(200).json({
    success: true,
    stats: {
      totalDestinations: travelsRes.total,
      totalBookings: bookingsRes.total,
      totalUsers: usersRes.total,
    },
  });
});

// GET /api/admin/travels
const getAdminTravels = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = sanitizeString(req.query.search || "", 120);
  const { items, total } = await store.listTravels({
    skip,
    limit,
    search,
    includeArchived: true,
    includeUnavailable: true,
  });

  res.status(200).json({
    success: true,
    data: items,
    pagination: buildPaginationMeta(page, limit, total),
  });
});

// GET /api/admin/bookings
const getAdminBookings = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const status = sanitizeString(req.query.status || "", 30);
  const { items, total } = await store.listAllBookings({ skip, limit, status });
  res.status(200).json({
    success: true,
    data: items,
    pagination: buildPaginationMeta(page, limit, total),
  });
});

// GET /api/admin/users
const getAdminUsers = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { items, total } = await store.listUsers({ skip, limit });
  res.status(200).json({
    success: true,
    data: items,
    pagination: buildPaginationMeta(page, limit, total),
  });
});

const VALID_ROLES = [
  "user",
  "admin",
  "property_owner",
  "transport_provider",
  "activity_provider",
  "tour_guide",
];

// POST /api/admin/users — Protected admin creation route
const createAdminUser = asyncHandler(async (req, res) => {
  const { username, email, password } = req.validated;
  const requestedRole = sanitizeString(req.body?.role || "user", 30);
  const role = VALID_ROLES.includes(requestedRole) ? requestedRole : "user";

  const existing = await store.findUserByEmail(email);
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await store.createUser({
    username,
    email,
    password: hashedPassword,
    role,
  });

  res.status(201).json({
    success: true,
    message: `Account created with role '${role}'.`,
    data: user,
  });
});

// PATCH /api/admin/users/:id/role
const updateUserRole = asyncHandler(async (req, res) => {
  const role = sanitizeString(req.body?.role || "", 30);
  if (!VALID_ROLES.includes(role)) {
    throw new ApiError(400, `Role must be one of: ${VALID_ROLES.join(", ")}.`);
  }
  if (String(req.params.id) === String(req.user.id) && role !== "admin") {
    throw new ApiError(400, "You cannot remove your own administrator role.");
  }
  const updated = await store.updateUserRole(req.params.id, role);
  res.status(200).json({
    success: true,
    message: "User role updated.",
    data: updated,
  });
});

module.exports = {
  getAdminOverview,
  getAdminTravels,
  getAdminBookings,
  getAdminUsers,
  createAdminUser,
  updateUserRole,
};

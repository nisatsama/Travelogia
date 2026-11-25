const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const store = require("../services/storeService");
const { sanitizeString } = require("../utils/sanitize");

function signToken(user) {
  return jwt.sign(
    { id: String(user._id), role: user.role },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN, algorithm: "HS256" },
  );
}

function setAuthCookie(res, token, req) {
  const isHttps =
    req.secure ||
    req.header("x-forwarded-proto") === "https" ||
    env.isProduction;

  const parts = [
    `${env.COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    `Max-Age=${2 * 60 * 60}`,
  ];
  if (isHttps) {
    parts.push("Secure", "SameSite=None", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

function clearAuthCookie(res, req) {
  const isHttps =
    req.secure ||
    req.header("x-forwarded-proto") === "https" ||
    env.isProduction;
  const parts = [
    `${env.COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
  ];
  if (isHttps) {
    parts.push("Secure", "SameSite=None", "Partitioned");
  } else {
    parts.push("SameSite=Lax");
  }
  res.setHeader("Set-Cookie", parts.join("; "));
}

// POST /api/signup — NEVER accepts role from req.body
const signup = asyncHandler(async (req, res) => {
  const { username, email, password } = req.validated;

  const existing = await store.findUserByEmail(email);
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const user = await store.createUser({
    username,
    email,
    password: hashedPassword,
    role: "user", // Strictly hardcoded — privilege escalation blocked
  });

  res.status(201).json({
    success: true,
    message: "Account created successfully.",
    role: user.role,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
    },
  });
});

// POST /api/login
const login = asyncHandler(async (req, res) => {
  const { email, password, role } = req.validated;

  const user = await store.findUserByEmail(email, { includePassword: true });
  if (!user) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new ApiError(401, "Invalid email or password.");
  }

  if (role && user.role !== role) {
    throw new ApiError(
      403,
      `This account is registered as ${user.role}, not ${role}.`,
    );
  }

  const token = signToken(user);
  setAuthCookie(res, token, req);

  res.status(200).json({
    success: true,
    token,
    role: user.role,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      bio: user.bio || "",
      phone: user.phone || "",
      location: user.location || "",
      memberSince: user.memberSince,
    },
  });
});

// POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  clearAuthCookie(res, req);
  res.status(200).json({
    success: true,
    message: "Signed out successfully.",
  });
});

// GET /api/auth/me
const me = asyncHandler(async (req, res) => {
  const user = await store.findUserById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found.");
  }
  res.status(200).json({
    success: true,
    user: {
      id: user._id,
      username: user.username,
      email: user.email,
      role: user.role,
      bio: user.bio || "",
      phone: user.phone || "",
      location: user.location || "",
      memberSince: user.memberSince,
    },
  });
});

// GET /api/auth/admin-bootstrap-status
const adminBootstrapStatus = asyncHandler(async (req, res) => {
  const adminCount = await store.countAdmins();
  res.status(200).json({
    success: true,
    canClaimInitialAdmin: adminCount === 0,
    requiresSetupSecret: Boolean(env.ADMIN_SETUP_SECRET),
  });
});

// POST /api/auth/claim-admin — One-time initial admin bootstrap locked once any admin exists
const claimInitialAdmin = asyncHandler(async (req, res) => {
  const adminCount = await store.countAdmins();
  if (adminCount > 0) {
    throw new ApiError(
      403,
      "Initial administrator has already been configured. Ask an existing admin to grant access.",
    );
  }

  if (env.ADMIN_SETUP_SECRET) {
    const provided = sanitizeString(req.body?.setupSecret, 200);
    if (!provided || provided !== env.ADMIN_SETUP_SECRET) {
      throw new ApiError(403, "Invalid admin setup secret.");
    }
  }

  const { username, email, password } = req.validated;
  const existing = await store.findUserByEmail(email);
  if (existing) {
    throw new ApiError(409, "An account with this email already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 12);
  const adminUser = await store.createUser({
    username,
    email,
    password: hashedPassword,
    role: "admin",
  });

  const token = signToken(adminUser);
  setAuthCookie(res, token, req);

  res.status(201).json({
    success: true,
    message: "Initial administrator account claimed successfully.",
    token,
    role: adminUser.role,
    user: {
      id: adminUser._id,
      username: adminUser.username,
      email: adminUser.email,
      role: adminUser.role,
    },
  });
});

module.exports = {
  signup,
  login,
  logout,
  me,
  adminBootstrapStatus,
  claimInitialAdmin,
};

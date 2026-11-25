const path = require("path");
const fs = require("fs");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const env = require("./config/env");
const { isDbConnected } = require("./config/database");
const { sanitizeRequest } = require("./middleware/validate");
const csrfProtect = require("./middleware/csrf");
const { apiLimiter, authLimiter } = require("./middleware/rateLimiter");
const errorHandler = require("./middleware/errorHandler");
const { validate } = require("./middleware/validate");
const { validateSignup, validateLogin } = require("./validators/authValidator");
const authController = require("./controllers/authController");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const travelRoutes = require("./routes/travelRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const favoriteRoutes = require("./routes/favoriteRoutes");
const packageRoutes = require("./routes/packageRoutes");
const chatbotRoutes = require("./routes/chatbotRoutes");
const adminRoutes = require("./routes/adminRoutes");
const itineraryRoutes = require("./routes/itineraryRoutes");
const budgetRoutes = require("./routes/budgetRoutes");
const collabTripRoutes = require("./routes/collabTripRoutes");
const {
  routePlannerRouter,
  readinessRouter,
  hiddenGemsRouter,
  compareRouter,
  recommendationsRouter,
} = require("./routes/intelligenceRoutes");
const journalRoutes = require("./routes/journalRoutes");
const packingRoutes = require("./routes/packingRoutes");
const priceWatchRoutes = require("./routes/priceWatchRoutes");

const app = express();
app.set("trust proxy", 1);

// Security headers (preserve OSM map tiles, Unsplash images, fonts, and iframe preview)
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: false,
  }),
);

// Explicit CORS allowlist (never wildcard with credentials)
const staticAllowedOrigins = new Set(
  [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "https://travelogia-8m7e.vercel.app",
    ...(env.FRONTEND_URL ? env.FRONTEND_URL.split(",").map((s) => s.trim()) : []),
  ].filter(Boolean),
);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (staticAllowedOrigins.has(origin)) return callback(null, true);
      try {
        const parsed = new URL(origin);
        if (parsed.hostname.endsWith(".run.app") || parsed.hostname.endsWith(".vercel.app")) {
          return callback(null, true);
        }
      } catch {
        // reject malformed origin
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "X-Idempotency-Key"],
  }),
);

// Request size limits & parsers
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "100kb" }));
app.use(cookieParser());
app.use(sanitizeRequest);

// ============================
// API ROUTER (/api)
// ============================
const apiRouter = express.Router();
apiRouter.use(apiLimiter);
apiRouter.use(csrfProtect);

apiRouter.get("/", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Travelogia API connected successfully",
    storage: isDbConnected() ? "mongodb" : "in-memory",
  });
});

apiRouter.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    status: "ok",
    database: isDbConnected() ? "connected" : "fallback-memory",
  });
});

// Auth routes (/api/auth/* AND backward-compatible /api/signup, /api/login)
apiRouter.use("/auth", authRoutes);
apiRouter.post("/signup", authLimiter, validate(validateSignup), authController.signup);
apiRouter.post("/login", authLimiter, validate(validateLogin), authController.login);

// Domain routes
apiRouter.use("/profile", userRoutes);
apiRouter.use("/travels", travelRoutes);
apiRouter.use("/bookings", bookingRoutes);
apiRouter.use("/favorites", favoriteRoutes);
apiRouter.use("/packages", packageRoutes);
apiRouter.use("/chatbot", chatbotRoutes);
apiRouter.use("/admin", adminRoutes);

// Travelogia 2.0 intelligence & workspace routes
apiRouter.use("/itineraries", itineraryRoutes);
apiRouter.use("/budgets", budgetRoutes);
apiRouter.use("/trips", collabTripRoutes);
apiRouter.use("/routes", routePlannerRouter);
apiRouter.use("/readiness", readinessRouter);
apiRouter.use("/hidden-gems", hiddenGemsRouter);
apiRouter.use("/compare", compareRouter);
apiRouter.use("/recommendations", recommendationsRouter);
apiRouter.use("/journals", journalRoutes);
apiRouter.use("/packing", packingRoutes);
apiRouter.use("/price-watch", priceWatchRoutes);

// 404 for unknown API paths
apiRouter.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`,
  });
});

app.use("/api", apiRouter);

// ============================
// SERVE FRONTEND BUILD (SPA)
// ============================
const frontendDist = path.join(__dirname, "../frontend/dist");
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(frontendDist, "index.html"));
    }
    return next();
  });
}

// Centralized safe error handler
app.use(errorHandler);

module.exports = app;

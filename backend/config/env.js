const crypto = require("crypto");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const NODE_ENV = process.env.NODE_ENV || "development";
const isProduction = NODE_ENV === "production";
const isTest = NODE_ENV === "test" || Boolean(process.env.VITEST);

// Security: Never use a hardcoded fallback secret string.
// In production, require JWT_SECRET explicitly.
// In dev/test preview before secrets are configured, generate an ephemeral per-process CSPRNG key.
let resolvedJwtSecret = process.env.JWT_SECRET;
if (!resolvedJwtSecret || resolvedJwtSecret.trim().length < 16) {
  if (isProduction) {
    throw new Error(
      "FATAL: JWT_SECRET environment variable must be set (min 16 characters) in production.",
    );
  }
  resolvedJwtSecret = crypto.randomBytes(32).toString("hex");
}

const env = {
  NODE_ENV,
  isProduction,
  isTest,
  PORT: Number(process.env.PORT) || 3000,
  MONGODB_URI: process.env.MONGODB_URI || process.env.MONGO_URL || "",
  JWT_SECRET: resolvedJwtSecret,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "2h",
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || "",
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-4-hydrogen",
  FRONTEND_URL: process.env.FRONTEND_URL || "",
  ADMIN_SETUP_SECRET: process.env.ADMIN_SETUP_SECRET || "",
  COOKIE_NAME: "travelogia_auth",
};

module.exports = env;

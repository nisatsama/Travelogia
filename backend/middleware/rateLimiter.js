const rateLimit = require("express-rate-limit");
const env = require("../config/env");

function createLimiter({ windowMs, max, message, skipInTest = false }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => skipInTest && env.isTest,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        message,
      });
    },
  });
}

const authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 50 : 20,
  message: "Too many authentication attempts. Please try again later.",
});

const chatbotLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: env.isTest ? 5 : 15,
  message: "Too many messages sent to Travelogia AI. Please wait a minute before trying again.",
});

const apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 400,
  message: "Too many requests from this IP. Please try again later.",
  skipInTest: true,
});

const aiFeatureLimiter = createLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many AI planning requests. Please wait a minute before trying again.",
  skipInTest: true,
});

module.exports = {
  authLimiter,
  chatbotLimiter,
  apiLimiter,
  aiFeatureLimiter,
};


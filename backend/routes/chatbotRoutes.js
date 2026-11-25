const express = require("express");
const router = express.Router();
const chatbotController = require("../controllers/chatbotController");
const { chatbotLimiter } = require("../middleware/rateLimiter");
const { validate } = require("../middleware/validate");
const { validateChatbotMessage } = require("../validators/chatbotValidator");

router.post(
  "/message",
  chatbotLimiter,
  validate(validateChatbotMessage),
  chatbotController.sendMessage,
);

module.exports = router;

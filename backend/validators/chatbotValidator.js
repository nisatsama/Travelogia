const ApiError = require("../utils/ApiError");

function validateChatbotMessage(req) {
  const body = req.body || {};
  const rawMessage = body.message;

  if (typeof rawMessage !== "string" || !rawMessage.trim()) {
    throw new ApiError(400, "Please enter a message for Travelogia AI.");
  }

  const message = rawMessage.trim();
  if (message.length > 1000) {
    throw new ApiError(400, "Message is too long (maximum 1000 characters).");
  }

  let conversationHistory = [];
  if (body.conversationHistory !== undefined) {
    if (!Array.isArray(body.conversationHistory)) {
      throw new ApiError(400, "conversationHistory must be an array.");
    }
    if (body.conversationHistory.length > 20) {
      conversationHistory = body.conversationHistory.slice(-12);
    } else {
      conversationHistory = body.conversationHistory;
    }
  }

  return { message, conversationHistory };
}

module.exports = {
  validateChatbotMessage,
};

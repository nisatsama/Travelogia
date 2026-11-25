const asyncHandler = require("../utils/asyncHandler");
const geminiService = require("../services/geminiService");

// POST /api/chatbot/message
const sendMessage = asyncHandler(async (req, res) => {
  const { message, conversationHistory } = req.validated;
  const result = await geminiService.generateTravelReply({
    message,
    conversationHistory,
  });

  res.status(200).json({
    success: true,
    reply: result.reply,
    suggestedDestinations: result.suggestedDestinations,
  });
});

module.exports = {
  sendMessage,
};

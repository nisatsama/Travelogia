const mongoose = require("mongoose");

const userPreferenceSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, unique: true, index: true },
    preferredCategories: { type: [String], default: [] },
    interests: { type: [String], default: [] },
    minBudgetPerNight: { type: Number, default: 20, min: 0 },
    maxBudgetPerNight: { type: Number, default: 300, min: 1 },
    preferredDurationDays: { type: Number, default: 4, min: 1, max: 60 },
    preferredSeason: { type: String, default: "" },
    viewedDestinationIds: { type: [String], default: [] },
    weights: {
      interest: { type: Number, default: 0.3 },
      budget: { type: Number, default: 0.25 },
      category: { type: Number, default: 0.2 },
      season: { type: Number, default: 0.15 },
      duration: { type: Number, default: 0.1 },
    },
  },
  { timestamps: true },
);

module.exports =
  mongoose.models.UserPreference ||
  mongoose.model("UserPreference", userPreferenceSchema);

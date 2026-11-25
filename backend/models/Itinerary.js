const mongoose = require("mongoose");

const itineraryDaySchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true, min: 1 },
    title: { type: String, required: true, trim: true },
    destinationId: { type: String, default: "" },
    destinationTitle: { type: String, default: "" },
    activities: { type: [String], default: [] },
    attractions: { type: [String], default: [] },
    accommodationArea: { type: String, default: "" },
    foodRecommendations: { type: [String], default: [] },
    alternativeActivities: { type: [String], default: [] },
    travelTips: { type: [String], default: [] },
    estimatedDayCostUSD: { type: Number, default: 0 },
  },
  { _id: false },
);

const itinerarySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    startingCity: { type: String, required: true, trim: true },
    destinationPreferences: { type: [String], default: [] },
    startDate: { type: String, default: "" },
    days: { type: Number, required: true, min: 1, max: 30 },
    travelers: { type: Number, required: true, min: 1, max: 20 },
    totalBudget: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    travelStyle: { type: String, default: "Cultural" },
    interests: { type: [String], default: [] },
    preferredActivities: { type: [String], default: [] },
    accommodationPreference: { type: String, default: "Mid-range" },
    matchedDestinationIds: { type: [String], default: [] },
    dayPlans: { type: [itineraryDaySchema], default: [] },
    budgetSummary: {
      estimatedTotal: { type: Number, default: 0 },
      perPerson: { type: Number, default: 0 },
      withinBudget: { type: Boolean, default: true },
      note: { type: String, default: "Server-calculated planning estimate." },
    },
    aiGenerated: { type: Boolean, default: true },
  },
  { timestamps: true },
);

itinerarySchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.Itinerary || mongoose.model("Itinerary", itinerarySchema);

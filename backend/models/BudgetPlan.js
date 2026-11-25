const mongoose = require("mongoose");

const budgetCategorySchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    estimated: { type: Number, required: true, min: 0 },
    actual: { type: Number, default: 0, min: 0 },
    percentage: { type: Number, default: 0 },
  },
  { _id: false },
);

const budgetPlanSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    currency: { type: String, enum: ["USD", "INR"], default: "USD" },
    totalBudget: { type: Number, required: true, min: 1 },
    travelers: { type: Number, required: true, min: 1, max: 30 },
    duration: { type: Number, required: true, min: 1, max: 60 },
    destinationIds: { type: [String], default: [] },
    accommodationPreference: { type: String, default: "mid-range" },
    transportPreference: { type: String, default: "train-or-economy" },
    activities: { type: [String], default: [] },
    categories: { type: [budgetCategorySchema], default: [] },
    estimatedGroupTotal: { type: Number, default: 0 },
    estimatedPerPerson: { type: Number, default: 0 },
    actualGroupTotal: { type: Number, default: 0 },
    overBudget: { type: Boolean, default: false },
    overBudgetAmount: { type: Number, default: 0 },
    optimizationSuggestions: { type: [String], default: [] },
  },
  { timestamps: true },
);

budgetPlanSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.BudgetPlan || mongoose.model("BudgetPlan", budgetPlanSchema);

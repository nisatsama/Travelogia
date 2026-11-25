const mongoose = require("mongoose");

const packingItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    category: {
      type: String,
      enum: [
        "Clothing",
        "Toiletries",
        "Documents",
        "Electronics",
        "Medicines & Essentials",
        "Activity Gear",
        "Optional",
      ],
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    quantity: { type: Number, default: 1, min: 1, max: 50 },
    checked: { type: Boolean, default: false },
    custom: { type: Boolean, default: false },
  },
  { _id: false },
);

const packingListSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    destinationId: { type: String, default: "" },
    destinationName: { type: String, required: true, trim: true },
    duration: { type: Number, required: true, min: 1, max: 60 },
    season: { type: String, default: "Mild" },
    travellerType: { type: String, default: "Solo" },
    activities: { type: [String], default: [] },
    weatherNote: { type: String, default: "" },
    items: { type: [packingItemSchema], default: [] },
    isTemplate: { type: Boolean, default: false },
  },
  { timestamps: true },
);

packingListSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.models.PackingList || mongoose.model("PackingList", packingListSchema);

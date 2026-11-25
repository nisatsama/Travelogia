const mongoose = require("mongoose");

const priceObservationSchema = new mongoose.Schema(
  {
    travelId: { type: String, required: true, index: true },
    destinationTitle: { type: String, required: true },
    estimatedPricePerNight: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    source: {
      type: String,
      enum: ["catalogue-estimate", "user-observation", "configured-feed"],
      default: "catalogue-estimate",
    },
    note: { type: String, default: "" },
    recordedBy: { type: String, default: "system" },
    observedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

const priceAlertSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    travelId: { type: String, required: true, index: true },
    destinationTitle: { type: String, required: true },
    targetPricePerNight: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "USD" },
    active: { type: Boolean, default: true },
    lastTriggeredAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const notificationSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    type: {
      type: String,
      enum: ["price-alert", "trip-invite", "system"],
      default: "price-alert",
    },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: "" },
    read: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

priceObservationSchema.index({ travelId: 1, observedAt: -1 });
priceAlertSchema.index({ user: 1, travelId: 1 });
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

module.exports = {
  PriceObservation:
    mongoose.models.PriceObservation ||
    mongoose.model("PriceObservation", priceObservationSchema),
  PriceAlert:
    mongoose.models.PriceAlert || mongoose.model("PriceAlert", priceAlertSchema),
  Notification:
    mongoose.models.Notification || mongoose.model("Notification", notificationSchema),
};

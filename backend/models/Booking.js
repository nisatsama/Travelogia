const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    travel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "travel",
      required: true,
      index: true,
    },
    destination: {
      type: String,
      required: true,
      trim: true,
    },
    travelers: {
      type: Number,
      required: true,
      min: 1,
      max: 20,
    },
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 1,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "USD",
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["confirmed", "cancelled", "completed"],
      default: "confirmed",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "reserved_no_payment", "cancelled"],
      default: "reserved_no_payment",
    },
    idempotencyKey: {
      type: String,
      default: null,
      index: true,
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ travel: 1, startDate: 1, status: 1 });

module.exports = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);

const mongoose = require("mongoose");
const { PAYMENT_STATUS } = require("../constants/commerceStates");

// Module 26: Razorpay Payment Transactions (NEVER stores card numbers, CVVs, or sensitive credentials)
const paymentTransactionSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    bookingType: {
      type: String,
      enum: ["STAY", "BUS", "CAR_RENTAL", "ACTIVITY", "GUIDE", "TOUR"],
      required: true,
    },
    bookingId: { type: String, required: true, index: true },
    bookingReference: { type: String, required: true },
    gateway: { type: String, default: "razorpay" },
    mode: { type: String, enum: ["live-sdk", "unconfigured"], default: "live-sdk" },
    razorpayOrderId: { type: String, required: true, index: true },
    razorpayPaymentId: { type: String, default: "" },
    signatureVerified: { type: Boolean, default: false },
    webhookVerified: { type: Boolean, default: false },
    amount: { type: Number, required: true, min: 1 },
    amountSubunits: { type: Number, required: true, min: 100 },
    currency: { type: String, enum: ["INR", "USD"], default: "INR" },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.ORDER_CREATED,
    },
    invoiceNumber: { type: String, required: true, unique: true },
    refundId: { type: String, default: "" },
    refundAmount: { type: Number, default: 0 },
    refundReason: { type: String, default: "" },
    paidAt: { type: Date, default: null },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Module 27: Digital Travel Wallet Documents
const walletDocumentSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    category: {
      type: String,
      enum: [
        "HOTEL_CONFIRMATION",
        "FLIGHT_REFERENCE",
        "TRAIN_REFERENCE",
        "BUS_TICKET",
        "ACTIVITY_BOOKING",
        "PAYMENT_RECEIPT",
        "TRAVEL_DOCUMENT",
      ],
      required: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    referenceCode: { type: String, default: "", trim: true, maxlength: 80 },
    referenceOrigin: {
      type: String,
      enum: ["internal-booking", "provider-issued", "user-uploaded"],
      default: "user-uploaded",
    },
    providerName: { type: String, default: "" },
    eventDate: { type: String, default: "" },
    notes: { type: String, default: "", maxlength: 500 },
    filePath: { type: String, default: "" },
    fileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    fileSize: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Module 28: User Notification Preferences
const notificationPreferenceSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, unique: true, index: true },
    bookingConfirmations: { type: Boolean, default: true },
    paymentUpdates: { type: Boolean, default: true },
    cancellationUpdates: { type: Boolean, default: true },
    checkInReminders: { type: Boolean, default: true },
    transportReminders: { type: Boolean, default: true },
    activityReminders: { type: Boolean, default: true },
    priceAlerts: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = {
  PaymentTransaction:
    mongoose.models.PaymentTransaction ||
    mongoose.model("PaymentTransaction", paymentTransactionSchema),
  WalletDocument:
    mongoose.models.WalletDocument || mongoose.model("WalletDocument", walletDocumentSchema),
  NotificationPreference:
    mongoose.models.NotificationPreference ||
    mongoose.model("NotificationPreference", notificationPreferenceSchema),
};

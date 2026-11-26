const mongoose = require("mongoose");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");

const propertySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 140 },
    propertyType: {
      type: String,
      enum: ["Hotel", "Homestay", "Hostel", "Villa", "Resort", "Guesthouse", "Apartment"],
      required: true,
    },
    category: {
      type: String,
      enum: ["Budget", "Mid-Range", "Boutique", "Luxury", "Eco-Stay", "Heritage"],
      default: "Mid-Range",
    },
    destinationId: { type: String, default: "", index: true },
    city: { type: String, required: true, trim: true, index: true },
    state: { type: String, default: "" },
    country: { type: String, required: true, trim: true },
    address: { type: String, default: "" },
    description: { type: String, required: true, maxlength: 2000 },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    images: [{ type: String }],
    amenities: [{ type: String }],
    starRating: { type: Number, min: 1, max: 5, default: 4 },
    guestRating: { type: Number, min: 0, max: 5, default: 4.5 },
    reviewCount: { type: Number, default: 0 },
    ownerId: { type: String, default: "system-host" },
    hostProfile: {
      name: { type: String, default: "" },
      languages: [{ type: String }],
      responseTime: { type: String, default: "Within 2 hours" },
      verifiedHost: { type: Boolean, default: true },
      bio: { type: String, default: "" },
    },
    checkInTime: { type: String, default: "14:00" },
    checkOutTime: { type: String, default: "11:00" },
    cancellationPolicy: {
      type: String,
      default: "Free cancellation up to 24 hours before check-in.",
    },
    isDemoInventory: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const roomTypeSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, index: true },
    roomCategory: {
      type: String,
      enum: ["Single", "Double", "Deluxe", "Suite", "Family"],
      required: true,
    },
    name: { type: String, required: true, trim: true },
    capacity: { type: Number, required: true, min: 1, max: 12 },
    basePricePerNight: { type: Number, required: true, min: 5 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    totalQuantity: { type: Number, required: true, min: 1, max: 100 },
    amenities: [{ type: String }],
    seasonalPricing: [
      {
        label: { type: String },
        startMonth: { type: Number, min: 1, max: 12 },
        endMonth: { type: Number, min: 1, max: 12 },
        multiplier: { type: Number, min: 0.5, max: 3.0, default: 1.0 },
      },
    ],
    availabilityStatus: {
      type: String,
      enum: ["AVAILABLE", "LIMITED", "SOLD_OUT", "MAINTENANCE"],
      default: "AVAILABLE",
    },
  },
  { timestamps: true },
);

const roomInventorySchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, index: true },
    roomTypeId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD
    totalQuantity: { type: Number, required: true, min: 1 },
    bookedQuantity: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);
roomInventorySchema.index({ roomTypeId: 1, dateKey: 1 }, { unique: true });

const stayBookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    propertyId: { type: String, required: true, index: true },
    propertyName: { type: String, required: true },
    propertyType: { type: String, required: true },
    city: { type: String, default: "" },
    roomTypeId: { type: String, required: true },
    roomName: { type: String, required: true },
    roomCategory: { type: String, required: true },
    checkInDate: { type: String, required: true },
    checkOutDate: { type: String, required: true },
    nights: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1 },
    roomsBooked: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    nightlyRateApplied: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    taxAmount: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.CONFIRMED,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    paymentTransactionId: { type: String, default: "" },
    guestName: { type: String, default: "" },
    specialRequests: { type: String, default: "", maxlength: 400 },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const stayReviewSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    overallRating: { type: Number, required: true, min: 1, max: 5 },
    cleanlinessScore: { type: Number, required: true, min: 1, max: 5 },
    locationScore: { type: Number, required: true, min: 1, max: 5 },
    serviceScore: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1500 },
    photos: [{ type: String }],
    moderationStatus: {
      type: String,
      enum: ["APPROVED", "FLAGGED", "HIDDEN"],
      default: "APPROVED",
    },
    ownerResponse: {
      text: { type: String, default: "", maxlength: 800 },
      respondedBy: { type: String, default: "" },
      respondedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

module.exports = {
  Property: mongoose.models.Property || mongoose.model("Property", propertySchema),
  RoomType: mongoose.models.RoomType || mongoose.model("RoomType", roomTypeSchema),
  RoomInventory:
    mongoose.models.RoomInventory || mongoose.model("RoomInventory", roomInventorySchema),
  StayBooking: mongoose.models.StayBooking || mongoose.model("StayBooking", stayBookingSchema),
  StayReview: mongoose.models.StayReview || mongoose.model("StayReview", stayReviewSchema),
};

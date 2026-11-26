const mongoose = require("mongoose");

const seasonalPriceSchema = new mongoose.Schema(
  {
    label: { type: String, trim: true },
    startMonth: { type: Number, min: 1, max: 12 },
    endMonth: { type: Number, min: 1, max: 12 },
    multiplier: { type: Number, min: 0.5, max: 3.0, default: 1.0 },
  },
  { _id: false },
);

const roomTypeSchema = new mongoose.Schema(
  {
    roomCode: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    roomCategory: {
      type: String,
      enum: ["Single", "Double", "Deluxe", "Suite", "Family"],
      required: true,
    },
    capacity: { type: Number, required: true, min: 1, max: 12 },
    basePrice: { type: Number, required: true, min: 5 },
    totalQuantity: { type: Number, required: true, min: 1, max: 100 },
    amenities: [{ type: String, trim: true }],
    seasonalPricing: [seasonalPriceSchema],
    availabilityStatus: {
      type: String,
      enum: ["available", "limited", "unavailable"],
      default: "available",
    },
  },
  { _id: false },
);

const propertySchema = new mongoose.Schema(
  {
    slug: { type: String, trim: true, index: true },
    name: { type: String, required: true, trim: true },
    propertyType: {
      type: String,
      enum: ["Hotel", "Homestay", "Hostel", "Villa", "Resort", "Guesthouse", "Apartment"],
      required: true,
      index: true,
    },
    categoryTier: {
      type: String,
      enum: ["Budget", "Boutique", "Mid-Range", "Luxury", "Heritage", "Eco-Stay"],
      default: "Mid-Range",
    },
    destinationId: { type: String, trim: true, index: true },
    city: { type: String, required: true, trim: true, index: true },
    state: { type: String, trim: true, default: "" },
    country: { type: String, required: true, trim: true },
    address: { type: String, trim: true, default: "" },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    description: { type: String, required: true, trim: true },
    images: [{ type: String, trim: true }],
    amenities: [{ type: String, trim: true }],
    rating: { type: Number, default: 4.5, min: 1, max: 5 },
    reviewCount: { type: Number, default: 0 },
    host: {
      name: { type: String, trim: true, default: "Travelogia Verified Host" },
      ownerUserId: { type: String, trim: true, default: "" },
      bio: { type: String, trim: true, default: "" },
      languages: [{ type: String, trim: true }],
      responseRate: { type: String, default: "Usually replies within a few hours" },
    },
    rooms: [roomTypeSchema],
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

const roomInventorySchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, index: true },
    roomCode: { type: String, required: true, index: true },
    dateKey: { type: String, required: true, index: true }, // YYYY-MM-DD
    totalQuantity: { type: Number, required: true, min: 1 },
    availableQuantity: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
roomInventorySchema.index({ propertyId: 1, roomCode: 1, dateKey: 1 }, { unique: true });

const stayBookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    username: { type: String, trim: true },
    tripId: { type: String, trim: true, default: "", index: true },
    propertyId: { type: String, required: true, index: true },
    propertyName: { type: String, required: true },
    propertyType: { type: String, required: true },
    city: { type: String, required: true },
    roomCode: { type: String, required: true },
    roomName: { type: String, required: true },
    roomCategory: { type: String, required: true },
    checkIn: { type: String, required: true }, // YYYY-MM-DD
    checkOut: { type: String, required: true }, // YYYY-MM-DD
    nights: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1 },
    roomsCount: { type: Number, required: true, min: 1 },
    nightlyRate: { type: Number, required: true },
    seasonalMultiplier: { type: Number, default: 1.0 },
    subtotal: { type: Number, required: true },
    taxesAndFees: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "FAILED"],
      default: "CONFIRMED",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "ORDER_CREATED", "PAID", "REFUNDED", "FAILED"],
      default: "UNPAID",
    },
    paymentTransactionId: { type: String, default: "" },
    specialRequests: { type: String, trim: true, maxlength: 400, default: "" },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

const propertyReviewSchema = new mongoose.Schema(
  {
    propertyId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    overallRating: { type: Number, required: true, min: 1, max: 5 },
    cleanlinessScore: { type: Number, required: true, min: 1, max: 5 },
    locationScore: { type: Number, required: true, min: 1, max: 5 },
    serviceScore: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, trim: true, maxlength: 1500 },
    photos: [{ type: String }],
    verifiedStay: { type: Boolean, default: true },
    moderationStatus: {
      type: String,
      enum: ["approved", "flagged", "hidden"],
      default: "approved",
    },
    ownerResponse: {
      text: { type: String, trim: true, maxlength: 800, default: "" },
      respondedBy: { type: String, default: "" },
      respondedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

module.exports = {
  Property: mongoose.models.Property || mongoose.model("Property", propertySchema),
  RoomInventory:
    mongoose.models.RoomInventory || mongoose.model("RoomInventory", roomInventorySchema),
  StayBooking: mongoose.models.StayBooking || mongoose.model("StayBooking", stayBookingSchema),
  PropertyReview:
    mongoose.models.PropertyReview || mongoose.model("PropertyReview", propertyReviewSchema),
};

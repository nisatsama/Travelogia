const mongoose = require("mongoose");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");

// Modules 13 & 15: Hotels, Homestays, Hostels, Villas, Resorts, Guesthouses, Apartments
const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    propertyType: {
      type: String,
      enum: ["Hotel", "Homestay", "Hostel", "Villa", "Resort", "Guesthouse", "Apartment"],
      default: "Hotel",
      index: true,
    },
    category: {
      type: String,
      enum: ["Budget", "Boutique", "Mid-Range", "Luxury", "Heritage", "Eco-Stay"],
      default: "Mid-Range",
    },
    travelId: { type: String, default: "", index: true },
    destination: { type: String, required: true, index: true },
    city: { type: String, required: true, index: true },
    state: { type: String, default: "" },
    country: { type: String, default: "India" },
    address: { type: String, default: "" },
    coordinates: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
    },
    description: { type: String, default: "" },
    images: [{ type: String }],
    amenities: [{ type: String }],
    rating: { type: Number, default: 4.5, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    ownerId: { type: String, default: "system-host" },
    hostInfo: {
      name: { type: String, default: "Travelogia Partner Host" },
      languages: [{ type: String }],
      responseTime: { type: String, default: "Within 2 hours" },
      verifiedHost: { type: Boolean, default: true },
      houseRules: [{ type: String }],
    },
    isDemoInventory: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Module 14: Room types & seasonal pricing
const roomSchema = new mongoose.Schema(
  {
    hotelId: { type: String, required: true, index: true },
    roomType: {
      type: String,
      enum: ["Single", "Double", "Deluxe", "Suite", "Family"],
      required: true,
    },
    title: { type: String, required: true },
    capacity: { type: Number, required: true, min: 1, max: 12 },
    basePrice: { type: Number, required: true, min: 1 },
    currency: { type: String, default: "INR" },
    totalQuantity: { type: Number, required: true, min: 1 },
    amenities: [{ type: String }],
    seasonalPricing: [
      {
        label: String,
        startMonth: Number, // 1-12
        endMonth: Number, // 1-12
        multiplier: { type: Number, default: 1.0 },
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

// Module 14: Per-date atomic room inventory tracking (prevents concurrent double booking)
const roomInventorySchema = new mongoose.Schema(
  {
    hotelId: { type: String, required: true, index: true },
    roomId: { type: String, required: true, index: true },
    dateKey: { type: String, required: true }, // YYYY-MM-DD
    totalQuantity: { type: Number, required: true, min: 0 },
    availableQuantity: { type: Number, required: true, min: 0 },
  },
  { timestamps: true },
);
roomInventorySchema.index({ roomId: 1, dateKey: 1 }, { unique: true });

// Module 13: Hotel & Homestay Bookings
const hotelBookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    hotelId: { type: String, required: true, index: true },
    hotelName: { type: String, required: true },
    propertyType: { type: String, default: "Hotel" },
    destination: { type: String, default: "" },
    roomId: { type: String, required: true },
    roomType: { type: String, required: true },
    checkIn: { type: String, required: true }, // YYYY-MM-DD
    checkOut: { type: String, required: true }, // YYYY-MM-DD
    nights: { type: Number, required: true, min: 1 },
    guests: { type: Number, required: true, min: 1 },
    roomsCount: { type: Number, required: true, min: 1 },
    nightlyRateApplied: { type: Number, required: true },
    taxesAndFees: { type: Number, required: true },
    totalPrice: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    bookingStatus: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.CONFIRMED,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    paymentId: { type: String, default: "" },
    guestName: { type: String, default: "" },
    specialRequests: { type: String, default: "" },
    cancelledAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Module 16: Verified Hotel Reviews with Moderation & Owner Responses
const hotelReviewSchema = new mongoose.Schema(
  {
    hotelId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    cleanlinessScore: { type: Number, required: true, min: 1, max: 5 },
    locationScore: { type: Number, required: true, min: 1, max: 5 },
    serviceScore: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1500 },
    photos: [{ type: String }],
    moderationStatus: {
      type: String,
      enum: ["APPROVED", "PENDING", "HIDDEN"],
      default: "APPROVED",
    },
    ownerResponse: {
      text: { type: String, default: "" },
      respondedBy: { type: String, default: "" },
      respondedAt: { type: Date, default: null },
    },
  },
  { timestamps: true },
);

module.exports = {
  Hotel: mongoose.models.Hotel || mongoose.model("Hotel", hotelSchema),
  Room: mongoose.models.Room || mongoose.model("Room", roomSchema),
  RoomInventory: mongoose.models.RoomInventory || mongoose.model("RoomInventory", roomInventorySchema),
  HotelBooking: mongoose.models.HotelBooking || mongoose.model("HotelBooking", hotelBookingSchema),
  HotelReview: mongoose.models.HotelReview || mongoose.model("HotelReview", hotelReviewSchema),
};

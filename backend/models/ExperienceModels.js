const mongoose = require("mongoose");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");

const activitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: [
        "Adventure Sports",
        "Trekking",
        "Guided Sightseeing",
        "Cultural Experience",
        "Local Tour",
        "Water Sports",
        "Workshop",
        "Nature Experience",
      ],
      required: true,
    },
    city: { type: String, required: true, index: true },
    country: { type: String, required: true },
    destinationId: { type: String, default: "" },
    providerId: { type: String, default: "system-activity" },
    providerName: { type: String, required: true },
    description: { type: String, required: true },
    durationHours: { type: Number, required: true },
    pricePerPerson: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    maxCapacityPerSlot: { type: Number, required: true, min: 1 },
    timeSlots: [{ type: String }], // e.g., ["07:00", "10:30", "15:00"]
    inclusions: [{ type: String }],
    image: { type: String, default: "" },
    rating: { type: Number, default: 4.7 },
    isDemoInventory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const activityBookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    activityId: { type: String, required: true, index: true },
    activityTitle: { type: String, required: true },
    city: { type: String, default: "" },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    participants: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    unitPrice: { type: Number, required: true },
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
  },
  { timestamps: true },
);

const tourGuideSchema = new mongoose.Schema(
  {
    userId: { type: String, default: "system-guide" },
    name: { type: String, required: true },
    city: { type: String, required: true, index: true },
    region: { type: String, default: "" },
    country: { type: String, required: true },
    languages: [{ type: String }],
    expertise: [{ type: String }],
    bio: { type: String, required: true },
    pricePerDay: { type: Number, required: true, min: 5 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    experienceYears: { type: Number, default: 4 },
    availableDays: [{ type: String }],
    rating: { type: Number, default: 4.8 },
    reviewCount: { type: Number, default: 0 },
    verifiedGuide: { type: Boolean, default: true },
    photo: { type: String, default: "" },
  },
  { timestamps: true },
);

const guideBookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    guideId: { type: String, required: true, index: true },
    guideName: { type: String, required: true },
    city: { type: String, default: "" },
    startDate: { type: String, required: true },
    days: { type: Number, required: true, min: 1, max: 14 },
    groupSize: { type: Number, default: 2, min: 1, max: 20 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    totalAmount: { type: Number, required: true },
    notes: { type: String, default: "", maxlength: 400 },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.PENDING,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.UNPAID,
    },
    paymentTransactionId: { type: String, default: "" },
  },
  { timestamps: true },
);

const guideReviewSchema = new mongoose.Schema(
  {
    guideId: { type: String, required: true, index: true },
    bookingId: { type: String, required: true, unique: true },
    user: { type: String, required: true },
    authorName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, required: true, maxlength: 1000 },
  },
  { timestamps: true },
);

const restaurantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    city: { type: String, required: true, index: true },
    country: { type: String, required: true },
    cuisines: [{ type: String }],
    priceTier: { type: String, enum: ["$", "$$", "$$$", "$$$$"], default: "$$" },
    rating: { type: Number, default: 4.6 },
    address: { type: String, default: "" },
    description: { type: String, default: "" },
    image: { type: String, default: "" },
    timeSlots: [
      {
        slot: { type: String, required: true }, // e.g., "13:00", "19:30"
        maxSeats: { type: Number, required: true, min: 2 },
      },
    ],
    isDemoInventory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const restaurantReservationSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    restaurantId: { type: String, required: true, index: true },
    restaurantName: { type: String, required: true },
    city: { type: String, default: "" },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    guests: { type: Number, required: true, min: 1, max: 20 },
    specialNotes: { type: String, default: "", maxlength: 300 },
    status: {
      type: String,
      enum: Object.values(BOOKING_STATUS),
      default: BOOKING_STATUS.CONFIRMED,
    },
  },
  { timestamps: true },
);

module.exports = {
  Activity: mongoose.models.Activity || mongoose.model("Activity", activitySchema),
  ActivityBooking:
    mongoose.models.ActivityBooking || mongoose.model("ActivityBooking", activityBookingSchema),
  TourGuide: mongoose.models.TourGuide || mongoose.model("TourGuide", tourGuideSchema),
  GuideBooking: mongoose.models.GuideBooking || mongoose.model("GuideBooking", guideBookingSchema),
  GuideReview: mongoose.models.GuideReview || mongoose.model("GuideReview", guideReviewSchema),
  Restaurant: mongoose.models.Restaurant || mongoose.model("Restaurant", restaurantSchema),
  RestaurantReservation:
    mongoose.models.RestaurantReservation ||
    mongoose.model("RestaurantReservation", restaurantReservationSchema),
};

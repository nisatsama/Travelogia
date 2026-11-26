const mongoose = require("mongoose");

const busRouteSchema = new mongoose.Schema(
  {
    operatorName: { type: String, required: true, trim: true },
    operatorRating: { type: Number, default: 4.4, min: 1, max: 5 },
    providerUserId: { type: String, default: "" },
    busType: { type: String, required: true, trim: true }, // AC Sleeper, Volvo Semi-Sleeper, etc.
    origin: { type: String, required: true, trim: true, index: true },
    destination: { type: String, required: true, trim: true, index: true },
    departureTime: { type: String, required: true },
    arrivalTime: { type: String, required: true },
    durationLabel: { type: String, required: true },
    farePerSeatINR: { type: Number, required: true, min: 100 },
    boardingPoints: [{ name: String, time: String }],
    droppingPoints: [{ name: String, time: String }],
    amenities: [{ type: String }],
    seatLayout: {
      rows: { type: Number, default: 8 },
      columns: { type: Number, default: 4 },
      seats: [{ seatNumber: String, deck: String, type: String }],
    },
    isDemoInventory: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const busBookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    routeId: { type: String, required: true, index: true },
    operatorName: { type: String, required: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    travelDate: { type: String, required: true, index: true }, // YYYY-MM-DD
    departureTime: { type: String, required: true },
    boardingPoint: { type: String, required: true },
    droppingPoint: { type: String, required: true },
    seatNumbers: [{ type: String, required: true }],
    passengerNames: [{ type: String }],
    farePerSeat: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "FAILED"],
      default: "CONFIRMED",
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "ORDER_CREATED", "PAID", "REFUNDED", "FAILED"],
      default: "UNPAID",
    },
    paymentTransactionId: { type: String, default: "" },
    isDemoInventory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const vehicleOptionSchema = new mongoose.Schema(
  {
    serviceType: {
      type: String,
      enum: ["Self-Drive", "Chauffeur-Driven", "Airport Transfer", "Local Cab"],
      required: true,
      index: true,
    },
    vehicleCategory: {
      type: String,
      enum: ["Hatchback", "Sedan", "SUV / 4x4", "Tempo Traveller", "Luxury"],
      required: true,
    },
    modelName: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true, index: true },
    seats: { type: Number, required: true, min: 2, max: 18 },
    transmission: { type: String, default: "Manual" },
    fuelType: { type: String, default: "Petrol/Diesel" },
    pricePerDayINR: { type: Number, required: true, min: 300 },
    driverDetails: {
      included: { type: Boolean, default: false },
      driverName: { type: String, default: "" },
      languages: [{ type: String }],
      experienceYears: { type: Number, default: 0 },
    },
    image: { type: String, default: "" },
    providerUserId: { type: String, default: "" },
    isDemoInventory: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const vehicleBookingSchema = new mongoose.Schema(
  {
    bookingRef: { type: String, required: true, unique: true, index: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    vehicleId: { type: String, required: true, index: true },
    serviceType: { type: String, required: true },
    modelName: { type: String, required: true },
    vehicleCategory: { type: String, required: true },
    pickupLocation: { type: String, required: true },
    dropoffLocation: { type: String, required: true },
    pickupDate: { type: String, required: true },
    durationDays: { type: Number, required: true, min: 1, max: 30 },
    driverDetails: { type: mongoose.Schema.Types.Mixed, default: null },
    dailyRate: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "FAILED"],
      default: "CONFIRMED",
    },
    paymentStatus: {
      type: String,
      enum: ["UNPAID", "ORDER_CREATED", "PAID", "REFUNDED", "FAILED"],
      default: "UNPAID",
    },
    paymentTransactionId: { type: String, default: "" },
  },
  { timestamps: true },
);

// Module 21: External Flight/Train references linked to a user's trip timeline
const transportReferenceSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    mode: { type: String, enum: ["flight", "train"], required: true },
    providerName: { type: String, required: true, trim: true },
    externalBookingRef: { type: String, required: true, trim: true },
    origin: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },
    departureDate: { type: String, required: true },
    departureTime: { type: String, default: "" },
    cabinOrClass: { type: String, default: "" },
    notes: { type: String, default: "", maxlength: 300 },
    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "CANCELLED", "COMPLETED", "FAILED"],
      default: "CONFIRMED",
    },
    sourceLabel: { type: String, default: "External Provider Reference (User-Recorded)" },
  },
  { timestamps: true },
);

module.exports = {
  BusRoute: mongoose.models.BusRoute || mongoose.model("BusRoute", busRouteSchema),
  BusBooking: mongoose.models.BusBooking || mongoose.model("BusBooking", busBookingSchema),
  VehicleOption:
    mongoose.models.VehicleOption || mongoose.model("VehicleOption", vehicleOptionSchema),
  VehicleBooking:
    mongoose.models.VehicleBooking || mongoose.model("VehicleBooking", vehicleBookingSchema),
  TransportReference:
    mongoose.models.TransportReference ||
    mongoose.model("TransportReference", transportReferenceSchema),
};

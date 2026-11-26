const mongoose = require("mongoose");
const { BOOKING_STATUS, PAYMENT_STATUS } = require("../constants/commerceStates");

const busRouteSchema = new mongoose.Schema(
  {
    operatorName: { type: String, required: true, trim: true },
    operatorRating: { type: Number, min: 1, max: 5, default: 4.4 },
    providerId: { type: String, default: "system-transport" },
    busType: { type: String, required: true }, // e.g., Volvo AC Sleeper, Semi-Sleeper
    originCity: { type: String, required: true, index: true },
    destinationCity: { type: String, required: true, index: true },
    departureTime: { type: String, required: true },
    arrivalTime: { type: String, required: true },
    durationHours: { type: Number, required: true },
    farePerSeat: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    boardingPoints: [{ name: String, time: String }],
    droppingPoints: [{ name: String, time: String }],
    seatLayout: {
      rows: { type: Number, default: 8 },
      cols: { type: Number, default: 4 },
      seats: [
        {
          seatNumber: { type: String, required: true },
          deck: { type: String, enum: ["lower", "upper"], default: "lower" },
          type: { type: String, enum: ["seater", "sleeper"], default: "seater" },
          priceModifier: { type: Number, default: 0 },
        },
      ],
    },
    amenities: [{ type: String }],
    isDemoInventory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const carVehicleSchema = new mongoose.Schema(
  {
    providerName: { type: String, required: true },
    providerId: { type: String, default: "system-transport" },
    city: { type: String, required: true, index: true },
    serviceType: {
      type: String,
      enum: ["self-drive", "chauffeur-driven", "airport-transfer", "local-cab"],
      required: true,
    },
    vehicleCategory: {
      type: String,
      enum: ["Hatchback", "Sedan", "SUV", "Tempo Traveller", "Luxury"],
      required: true,
    },
    modelName: { type: String, required: true },
    seats: { type: Number, required: true, min: 2, max: 20 },
    pricePerDay: { type: Number, required: true, min: 5 },
    pricePerTransfer: { type: Number, required: true, min: 5 },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    driverProfile: {
      name: { type: String, default: "" },
      experienceYears: { type: Number, default: 0 },
      languages: [{ type: String }],
      verifiedLicense: { type: Boolean, default: true },
    },
    image: { type: String, default: "" },
    isDemoInventory: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Unified Transport Reservation linking Flight/Train external refs, Bus seat bookings, and Car/Cab rentals to a Trip
const transportReservationSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: String, required: true, index: true },
    tripId: { type: String, default: "", index: true },
    mode: {
      type: String,
      enum: ["FLIGHT_REF", "TRAIN_REF", "BUS", "CAR_RENTAL"],
      required: true,
    },
    providerName: { type: String, required: true },
    origin: { type: String, required: true },
    destination: { type: String, required: true },
    travelDate: { type: String, required: true, index: true },
    returnDate: { type: String, default: "" },
    departureTime: { type: String, default: "" },
    routeOrVehicleId: { type: String, default: "", index: true },
    boardingPoint: { type: String, default: "" },
    droppingPoint: { type: String, default: "" },
    seatNumbers: [{ type: String }],
    serviceType: { type: String, default: "" },
    rentalDays: { type: Number, default: 1 },
    passengerCount: { type: Number, default: 1, min: 1 },
    externalReferenceCode: { type: String, default: "" },
    externalBookingUrl: { type: String, default: "" },
    driverDetails: {
      name: { type: String, default: "" },
      languages: [{ type: String }],
    },
    currency: { type: String, enum: ["USD", "INR"], default: "INR" },
    totalAmount: { type: Number, default: 0, min: 0 },
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
    isDemoInventory: { type: Boolean, default: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = {
  BusRoute: mongoose.models.BusRoute || mongoose.model("BusRoute", busRouteSchema),
  CarVehicle: mongoose.models.CarVehicle || mongoose.model("CarVehicle", carVehicleSchema),
  TransportReservation:
    mongoose.models.TransportReservation ||
    mongoose.model("TransportReservation", transportReservationSchema),
};

const mongoose = require("mongoose");

const memberSchema = new mongoose.Schema(
  {
    user: { type: String, required: true },
    username: { type: String, required: true },
    email: { type: String, required: true },
    role: { type: String, enum: ["owner", "editor", "viewer"], default: "editor" },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tripDestinationSchema = new mongoose.Schema(
  {
    travelId: { type: String, required: true },
    title: { type: String, required: true },
    city: { type: String, default: "" },
    country: { type: String, default: "" },
    pricePerNight: { type: Number, default: 0 },
    coordinates: {
      latitude: { type: Number },
      longitude: { type: Number },
    },
    addedBy: { type: String, default: "" },
    votes: { type: [String], default: [] },
  },
  { _id: false },
);

const tripActivitySchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    day: { type: Number, default: 1 },
    title: { type: String, required: true, trim: true },
    assignedTo: { type: String, default: "" },
    status: { type: String, enum: ["planned", "done"], default: "planned" },
    votes: { type: [String], default: [] },
  },
  { _id: false },
);

const tripCommentSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    userId: { type: String, required: true },
    username: { type: String, required: true },
    text: { type: String, required: true, maxlength: 1000 },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const tripExpenseSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "USD" },
    paidByUserId: { type: String, required: true },
    paidByName: { type: String, required: true },
    splitBetween: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const collabTripSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 600, default: "" },
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
    ownerId: { type: String, required: true, index: true },
    inviteCode: { type: String, required: true, unique: true, index: true },
    members: { type: [memberSchema], default: [] },
    destinations: { type: [tripDestinationSchema], default: [] },
    activities: { type: [tripActivitySchema], default: [] },
    comments: { type: [tripCommentSchema], default: [] },
    expenses: { type: [tripExpenseSchema], default: [] },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

collabTripSchema.index({ "members.user": 1 });

module.exports = mongoose.models.CollabTrip || mongoose.model("CollabTrip", collabTripSchema);

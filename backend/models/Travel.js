const mongoose = require("mongoose");
const { slugify } = require("../utils/sanitize");

const TRI_STATE = ["yes", "no", "unknown"];

const travelSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    country: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    state: {
      type: String,
      trim: true,
      default: "",
    },
    region: {
      type: String,
      trim: true,
      default: "",
      index: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      url: { type: String, required: true },
      filename: { type: String, default: "" },
    },
    gallery: {
      type: [String],
      default: [],
    },
    pricePerNight: {
      type: Number,
      required: true,
      min: 1,
      index: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    priceIsEstimate: {
      type: Boolean,
      default: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    bestTimeToVisit: {
      type: String,
      trim: true,
      default: "Year-round",
    },
    estimatedDuration: {
      type: String,
      trim: true,
      default: "3-5 Days",
    },
    approximateBudget: {
      type: String,
      trim: true,
      default: "",
    },
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 4.5,
      index: true,
    },
    coordinates: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    highlights: {
      type: [String],
      default: [],
    },
    amenities: {
      type: [String],
      default: [],
    },
    activities: {
      type: [String],
      default: [],
    },
    travelTips: {
      type: [String],
      default: [],
    },
    isHiddenGem: {
      type: Boolean,
      default: false,
      index: true,
    },
    accessibility: {
      wheelchairAccessible: { type: String, enum: TRI_STATE, default: "unknown" },
      accessibleAccommodation: { type: String, enum: TRI_STATE, default: "unknown" },
      publicTransport: { type: String, enum: TRI_STATE, default: "unknown" },
      familyFriendly: { type: String, enum: TRI_STATE, default: "unknown" },
      accessibleAttractions: { type: String, enum: TRI_STATE, default: "unknown" },
      walkingIntensity: {
        type: String,
        enum: ["low", "moderate", "high", "unknown"],
        default: "unknown",
      },
      notes: { type: String, trim: true, maxlength: 400, default: "" },
      source: {
        type: String,
        enum: ["curated-baseline", "user-submitted", "verified", "unknown"],
        default: "curated-baseline",
      },
      lastUpdated: { type: Date, default: Date.now },
    },
    readinessInfo: {
      permitRequired: { type: Boolean, default: false },
      permitDetails: { type: String, trim: true, default: "" },
      roadAccessibility: { type: String, trim: true, default: "" },
      emergencyNumber: { type: String, trim: true, default: "" },
      seasonalAdvisory: { type: String, trim: true, default: "" },
      preparationChecklist: { type: [String], default: [] },
    },
    featured: {
      type: Boolean,
      default: false,
      index: true,
    },
    isAvailable: {
      type: Boolean,
      default: true,
      index: true,
    },
    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },
    maxCapacity: {
      type: Number,
      min: 1,
      default: 20,
    },
    viewCount: {
      type: Number,
      default: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

travelSchema.index({
  title: "text",
  city: "text",
  country: "text",
  state: "text",
  region: "text",
  description: "text",
});
travelSchema.index({ category: 1, country: 1, pricePerNight: 1 });
travelSchema.index({ isHiddenGem: 1, region: 1 });

travelSchema.pre("validate", function () {
  if (!this.slug && this.title) {
    this.slug = slugify(`${this.title}-${this.city || ""}`);
  }
});

module.exports = mongoose.models.travel || mongoose.model("travel", travelSchema);

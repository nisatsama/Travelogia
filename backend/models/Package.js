const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["Solo", "Honeymoon", "Family", "School", "Adventure", "Luxury", "Group"],
      required: true,
      index: true,
    },
    destination: {
      type: String,
      trim: true,
    },
    duration: String,
    price: {
      type: Number,
      min: 0,
    },
    description: String,
    image: {
      url: String,
      filename: String,
    },
    highlights: {
      type: [String],
      default: [],
    },
    amenities: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

module.exports = mongoose.models.Package || mongoose.model("Package", packageSchema);

const mongoose = require("mongoose");

const packageSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },

    category: {
      type: String,
      enum: [
        "Solo",
        "Honeymoon",
        "Family",
        "School",
        "Adventure",
        "Luxury",
        "Group",
      ],
      required: true,
    },

    destination: String,

    duration: String,

    price: Number,

    description: String,

    image: {
      url: String,
      filename: String,
    },

    highlights: [String],

    amenities: [String],
  },
  { timestamps: true },
);

module.exports = mongoose.model("Package", packageSchema);

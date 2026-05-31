const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const travelSchema = new Schema({
  title: String,

  description: String,

  country: String,

  city: String,

  location: String,

  image: {
    url: String,
    filename: String,
  },

  pricePerNight: Number,

  category: String,

  bestTimeToVisit: String,

  rating: Number,

  coordinates: {
    latitude: Number,
    longitude: Number,
  },

  highlights: [String],

  amenities: [String],

  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  reviews: [
    {
      user: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },

      comment: String,

      rating: Number,

      createdAt: Date,
    },
  ],

  createdAt: Date,
});

const travel = mongoose.model("travel", travelSchema);

module.exports = travel;

const mongoose = require("mongoose");

const bookingSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },

  travel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "travel",
  },

  travelers: Number,
  duration: Number,

  totalCost: Number,

  date: Date,

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Booking", bookingSchema);

const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    travel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "travel",
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

favoriteSchema.index({ user: 1, travel: 1 }, { unique: true });

module.exports = mongoose.models.Favourite || mongoose.model("Favourite", favoriteSchema);

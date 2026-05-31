// models/Favorite.js

const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  travel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "travel",
    required: true,
  },
});

module.exports = mongoose.model("Favourite", favoriteSchema);

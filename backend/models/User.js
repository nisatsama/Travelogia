const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 60,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: [
        "user",
        "admin",
        "property_owner",
        "transport_provider",
        "activity_provider",
        "tour_guide",
      ],
      default: "user",
      immutable: false,
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    location: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "",
    },
    memberSince: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.models.User || mongoose.model("User", userSchema);

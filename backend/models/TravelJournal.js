const mongoose = require("mongoose");

const travelJournalSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    authorName: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    locationName: { type: String, required: true, trim: true, maxlength: 140 },
    travelId: { type: String, default: "" },
    visitDate: { type: String, required: true },
    coordinates: {
      latitude: { type: Number, min: -90, max: 90 },
      longitude: { type: Number, min: -180, max: 180 },
    },
    photos: {
      type: [
        {
          url: { type: String, required: true },
          caption: { type: String, default: "" },
        },
      ],
      default: [],
    },
    tags: { type: [String], default: [] },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    isPublic: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

travelJournalSchema.index({ user: 1, visitDate: -1 });
travelJournalSchema.index({ isPublic: 1, createdAt: -1 });

module.exports =
  mongoose.models.TravelJournal || mongoose.model("TravelJournal", travelJournalSchema);

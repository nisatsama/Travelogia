const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const asyncHandler = require("../utils/asyncHandler");
const ApiError = require("../utils/ApiError");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");

const UPLOAD_DIR = path.resolve(__dirname, "../../uploads/journals");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
]);

const storage = multer.diskStorage({
  destination(req, file, cb) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename(req, file, cb) {
    const ext = ALLOWED_MIME.get(file.mimetype);
    if (!ext) {
      return cb(new ApiError(400, "Only JPEG, PNG, and WEBP images are allowed."));
    }
    const safeName = `${crypto.randomBytes(12).toString("hex")}${ext}`;
    return cb(null, safeName);
  },
});

const uploadJournalPhotos = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB max per image
    files: 4,
  },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new ApiError(400, "Invalid image format. Only JPEG, PNG, and WEBP are supported."));
    }
    return cb(null, true);
  },
});

exports.uploadMiddleware = uploadJournalPhotos.array("photos", 4);

exports.serveJournalPhoto = (req, res, next) => {
  const filename = String(req.params.filename || "");
  if (!/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(filename)) {
    return next(new ApiError(400, "Invalid photo filename."));
  }
  const resolved = path.resolve(UPLOAD_DIR, filename);
  if (!resolved.startsWith(UPLOAD_DIR + path.sep)) {
    return next(new ApiError(403, "Invalid file path."));
  }
  if (!fs.existsSync(resolved)) {
    return next(new ApiError(404, "Photo not found."));
  }
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "public, max-age=86400");
  return res.sendFile(resolved);
};

exports.listPublicStories = asyncHandler(async (req, res) => {
  const stories = await v2Store.listPublicJournals();
  res.status(200).json({ success: true, data: stories });
});

exports.listMyJournals = asyncHandler(async (req, res) => {
  const entries = await v2Store.listUserJournals(req.user.id);
  res.status(200).json({ success: true, data: entries });
});

exports.getJournalEntry = asyncHandler(async (req, res) => {
  const entry = await v2Store.findJournalById(req.params.id);
  if (!entry) throw new ApiError(404, "Journal entry not found.");
  if (!entry.isPublic && (!req.user || String(entry.user) !== String(req.user.id))) {
    throw new ApiError(403, "This travel memory is private.");
  }
  res.status(200).json({ success: true, data: entry });
});

exports.createJournalEntry = asyncHandler(async (req, res) => {
  const {
    title,
    location,
    travelId = "",
    visitDate = "",
    story,
    tags = [],
    rating = 5,
    isPublic = false,
    latitude = "",
    longitude = "",
  } = req.body || {};

  if (!title || String(title).trim().length < 2) {
    throw new ApiError(400, "Journal title must be at least 2 characters.");
  }
  if (!location || String(location).trim().length < 2) {
    throw new ApiError(400, "Location name is required.");
  }
  if (!story || String(story).trim().length < 5) {
    throw new ApiError(400, "Please write at least a short travel memory story.");
  }

  let coords = { latitude: null, longitude: null };
  if (travelId) {
    const travel = await store.findTravelById(String(travelId).trim()).catch(() => null);
    if (travel?.coordinates) {
      coords = {
        latitude: travel.coordinates.latitude,
        longitude: travel.coordinates.longitude,
      };
    }
  }
  if (latitude !== "" && longitude !== "") {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      coords = { latitude: lat, longitude: lon };
    }
  }

  const parsedTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
    : typeof tags === "string"
      ? tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 10)
      : [];

  const uploadedPhotos = Array.isArray(req.files)
    ? req.files.map((f) => `/api/journals/photo/${f.filename}`)
    : [];

  const created = await v2Store.createJournal({
    user: req.user.id,
    authorName: req.user.username,
    title: String(title).trim().slice(0, 140),
    location: String(location).trim().slice(0, 120),
    travelId: String(travelId || "").trim(),
    visitDate: String(visitDate || new Date().toISOString().slice(0, 10)),
    story: String(story).trim().slice(0, 4000),
    photos: uploadedPhotos,
    tags: parsedTags,
    rating: Math.min(5, Math.max(1, Number(rating) || 5)),
    isPublic: isPublic === true || isPublic === "true",
    coordinates: coords,
  });

  res.status(201).json({ success: true, data: created });
});

exports.updateJournalEntry = asyncHandler(async (req, res) => {
  const existing = await v2Store.findJournalById(req.params.id);
  if (!existing) throw new ApiError(404, "Journal entry not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to edit this journal entry.");
  }

  const updates = {};
  if (typeof req.body?.title === "string" && req.body.title.trim().length >= 2) {
    updates.title = req.body.title.trim().slice(0, 140);
  }
  if (typeof req.body?.location === "string" && req.body.location.trim().length >= 2) {
    updates.location = req.body.location.trim().slice(0, 120);
  }
  if (typeof req.body?.story === "string" && req.body.story.trim().length >= 5) {
    updates.story = req.body.story.trim().slice(0, 4000);
  }
  if (typeof req.body?.visitDate === "string") {
    updates.visitDate = req.body.visitDate.trim();
  }
  if (req.body?.rating !== undefined) {
    updates.rating = Math.min(5, Math.max(1, Number(req.body.rating) || 5));
  }
  if (req.body?.isPublic !== undefined) {
    updates.isPublic = req.body.isPublic === true || req.body.isPublic === "true";
  }
  if (req.body?.tags !== undefined) {
    updates.tags = Array.isArray(req.body.tags)
      ? req.body.tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 10)
      : String(req.body.tags)
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
          .slice(0, 10);
  }

  const updated = await v2Store.updateJournal(existing._id, updates);
  res.status(200).json({ success: true, data: updated });
});

exports.deleteJournalEntry = asyncHandler(async (req, res) => {
  const existing = await v2Store.findJournalById(req.params.id);
  if (!existing) throw new ApiError(404, "Journal entry not found.");
  if (String(existing.user) !== String(req.user.id)) {
    throw new ApiError(403, "You do not have permission to delete this journal entry.");
  }

  // Safely clean up locally uploaded photos if they exist inside UPLOAD_DIR
  for (const photoUrl of existing.photos || []) {
    const filename = path.basename(String(photoUrl || ""));
    if (/^[a-f0-9]{24}\.(jpg|png|webp)$/.test(filename)) {
      const resolved = path.resolve(UPLOAD_DIR, filename);
      if (resolved.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
        fs.unlink(resolved, () => {});
      }
    }
  }

  await v2Store.deleteJournal(existing._id);
  res.status(200).json({ success: true, message: "Journal entry deleted." });
});

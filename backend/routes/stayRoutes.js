const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const ApiError = require("../utils/ApiError");
const requireAuth = require("../middleware/auth");
const optionalAuth = require("../middleware/optionalAuth");
const { requireRoles } = require("../middleware/roles");
const stayController = require("../controllers/stayController");

const router = express.Router();

fs.mkdirSync(stayController.REVIEW_UPLOAD_DIR, { recursive: true });

const MIME_TO_EXT = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const reviewPhotoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, stayController.REVIEW_UPLOAD_DIR);
    },
    filename(req, file, cb) {
      const ext = MIME_TO_EXT[file.mimetype] || ".jpg";
      cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter(req, file, cb) {
    if (!MIME_TO_EXT[file.mimetype]) {
      return cb(new ApiError(400, "Only JPEG, PNG, and WEBP review photos are allowed."));
    }
    return cb(null, true);
  },
});

// Public / optional-auth property search & review photo serving
router.get("/", stayController.searchProperties);
router.get("/review-photo/:filename", stayController.serveReviewPhoto);

// Authenticated guest stay bookings
router.get("/bookings/mine", requireAuth, stayController.listMyStayBookings);
router.post("/bookings", requireAuth, stayController.createStayBooking);
router.patch("/bookings/:bookingId/cancel", requireAuth, stayController.cancelStayBooking);
router.patch("/bookings/:bookingId/complete", requireAuth, stayController.completeStayBooking);

// Property owner / admin management
router.post(
  "/",
  requireAuth,
  requireRoles("admin", "property_owner"),
  stayController.createProperty,
);
router.post(
  "/:id/rooms",
  requireAuth,
  requireRoles("admin", "property_owner"),
  stayController.addRoomType,
);
router.patch(
  "/rooms/:roomTypeId",
  requireAuth,
  requireRoles("admin", "property_owner"),
  stayController.updateRoomInventoryConfig,
);

// Verified stay reviews (Module 16)
router.post(
  "/:id/reviews",
  requireAuth,
  reviewPhotoUpload.array("photos", 4),
  stayController.submitStayReview,
);
router.patch(
  "/reviews/:reviewId/respond",
  requireAuth,
  requireRoles("admin", "property_owner"),
  stayController.respondToStayReview,
);
router.patch(
  "/reviews/:reviewId/moderate",
  requireAuth,
  requireRoles("admin"),
  stayController.moderateStayReview,
);

// Property details (keep after static subpaths)
router.get("/:id", optionalAuth, stayController.getPropertyDetails);

module.exports = router;

const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const ApiError = require("../utils/ApiError");
const requireAuth = require("../middleware/auth");
const hub = require("../controllers/commerceHubController");

fs.mkdirSync(hub.WALLET_UPLOAD_DIR, { recursive: true });

const WALLET_MIME_TO_EXT = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const walletUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, hub.WALLET_UPLOAD_DIR);
    },
    filename(req, file, cb) {
      const ext = WALLET_MIME_TO_EXT[file.mimetype] || ".pdf";
      cb(null, `${crypto.randomBytes(16).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter(req, file, cb) {
    if (!WALLET_MIME_TO_EXT[file.mimetype]) {
      return cb(new ApiError(400, "Only PDF, JPEG, PNG, and WEBP documents are accepted in the Travel Wallet."));
    }
    return cb(null, true);
  },
});

// Module 26 — Payments Router (webhook is mounted directly in app.js before CSRF)
const paymentsRouter = express.Router();
paymentsRouter.get("/config", hub.getPaymentGatewayConfig);
paymentsRouter.post("/orders", requireAuth, hub.createPaymentOrder);
paymentsRouter.post("/verify", requireAuth, hub.verifyPayment);
paymentsRouter.post("/:id/refund", requireAuth, hub.refundPayment);
paymentsRouter.get("/history", requireAuth, hub.listPaymentHistory);
paymentsRouter.get("/:id/invoice", requireAuth, hub.getPaymentInvoice);

// Module 27 — Digital Travel Wallet Router (all routes strictly authenticated & owner-scoped)
const walletRouter = express.Router();
walletRouter.get("/", requireAuth, hub.listWalletDocuments);
walletRouter.post("/", requireAuth, walletUpload.single("file"), hub.uploadWalletDocument);
walletRouter.get("/:id/file", requireAuth, hub.downloadWalletFile);
walletRouter.get("/:id/qr", requireAuth, hub.getWalletDocumentQr);
walletRouter.delete("/:id", requireAuth, hub.deleteWalletDocument);

// Module 28 — Smart Travel Notifications Router
const notificationsRouter = express.Router();
notificationsRouter.get("/", requireAuth, hub.listNotificationsAndPrefs);
notificationsRouter.patch("/:id/read", requireAuth, hub.markNotificationRead);
notificationsRouter.put("/preferences", requireAuth, hub.updateNotificationPreferences);
notificationsRouter.post("/run-reminders", requireAuth, hub.triggerTravelRemindersNow);

// Module 25 — Unified Trip Dashboard Router
const dashboardRouter = express.Router();
dashboardRouter.get("/", requireAuth, hub.getUnifiedTripDashboard);

// Module 29 — Travel Insurance Discovery Router
const insuranceRouter = express.Router();
insuranceRouter.get("/providers", hub.listInsuranceProviders);

module.exports = {
  paymentsRouter,
  walletRouter,
  notificationsRouter,
  dashboardRouter,
  insuranceRouter,
  handlePaymentWebhook: hub.handlePaymentWebhook,
};

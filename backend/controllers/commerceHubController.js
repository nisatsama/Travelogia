const fs = require("fs");
const path = require("path");
const QRCode = require("qrcode");
const ApiError = require("../utils/ApiError");
const asyncHandler = require("../utils/asyncHandler");
const { sanitizeString } = require("../utils/sanitize");
const seed = require("../data/commerceSeedData");
const store = require("../services/storeService");
const v2Store = require("../services/v2StoreService");
const cStore = require("../services/commerceStoreService");
const paymentService = require("../services/paymentService");
const { runUpcomingTravelReminders } = require("../services/notificationService");

const WALLET_UPLOAD_DIR = path.resolve(__dirname, "../uploads/wallet");

// ============================
// MODULE 26 — RAZORPAY PAYMENT GATEWAY
// ============================
const getPaymentGatewayConfig = asyncHandler(async (req, res) => {
  const { configured, keyId } = paymentService.getRazorpayConfig();
  res.status(200).json({
    success: true,
    gateway: "razorpay",
    configured,
    // Public key_id only; NEVER expose key_secret or webhook_secret
    keyId: configured ? keyId : "",
    disclosure: configured
      ? "Razorpay live/test checkout SDK is active. All payments are verified server-side via HMAC-SHA256."
      : "Razorpay credentials (RAZORPAY_KEY_ID & RAZORPAY_KEY_SECRET) are not configured yet. Configure them in server Secrets to accept payments.",
  });
});

const createPaymentOrder = asyncHandler(async (req, res) => {
  const bookingType = sanitizeString(req.body?.bookingType || "", 30).toUpperCase();
  const bookingId = sanitizeString(req.body?.bookingId || "", 80);
  if (!bookingType || !bookingId) {
    throw new ApiError(400, "bookingType and bookingId are required.");
  }

  const result = await paymentService.createRazorpayOrder({
    bookingType,
    bookingId,
    userId: req.user.id,
  });

  res.status(201).json({
    success: true,
    message: "Razorpay order created using authoritative server-side booking total.",
    data: result,
  });
});

const verifyPayment = asyncHandler(async (req, res) => {
  const razorpayOrderId = sanitizeString(
    req.body?.razorpayOrderId || req.body?.razorpay_order_id || "",
    100,
  );
  const razorpayPaymentId = sanitizeString(
    req.body?.razorpayPaymentId || req.body?.razorpay_payment_id || "",
    100,
  );
  const razorpaySignature = sanitizeString(
    req.body?.razorpaySignature || req.body?.razorpay_signature || "",
    200,
  );

  const result = await paymentService.verifyRazorpayPayment({
    razorpayOrderId,
    razorpayPaymentId,
    razorpaySignature,
    userId: req.user.id,
  });

  res.status(200).json({
    success: true,
    message: result.alreadyVerified
      ? "Payment was already verified."
      : "Payment verified server-side and booking marked PAID.",
    data: result.transaction,
  });
});

// Signed webhook receiver (uses req.rawBody captured before JSON parsing)
const handlePaymentWebhook = asyncHandler(async (req, res) => {
  const signatureHeader = req.get("x-razorpay-signature") || "";
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
  const result = await paymentService.handleRazorpayWebhook({
    rawBody,
    signatureHeader,
  });
  res.status(200).json({ success: true, data: result });
});

const refundPayment = asyncHandler(async (req, res) => {
  const reason = sanitizeString(req.body?.reason || "Customer requested refund", 200);
  const updated = await paymentService.refundRazorpayPayment({
    transactionId: req.params.id,
    userId: req.user.id,
    isAdmin: req.user.role === "admin",
    reason,
  });
  res.status(200).json({
    success: true,
    message: "Refund processed via Razorpay.",
    data: updated,
  });
});

const listPaymentHistory = asyncHandler(async (req, res) => {
  const rows = await cStore.listUserPayments(req.user.id);
  res.status(200).json({ success: true, count: rows.length, data: rows });
});

const getPaymentInvoice = asyncHandler(async (req, res) => {
  const tx = await cStore.findPaymentById(req.params.id);
  if (!tx) throw new ApiError(404, "Payment transaction not found.");
  if (req.user.role !== "admin" && String(tx.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only view your own invoices.");
  }

  res.status(200).json({
    success: true,
    invoice: {
      invoiceNumber: tx.invoiceNumber,
      issuedBy: "Travelogia Commerce Platform",
      bookingReference: tx.bookingReference,
      bookingType: tx.bookingType,
      customerName: req.user.username || "Travelogia Customer",
      customerEmail: req.user.email || "",
      amount: tx.amount,
      currency: tx.currency,
      paymentStatus: tx.status,
      gateway: tx.gateway,
      razorpayOrderId: tx.razorpayOrderId,
      razorpayPaymentId: tx.razorpayPaymentId || null,
      signatureVerified: Boolean(tx.signatureVerified),
      paidAt: tx.paidAt || null,
      refundId: tx.refundId || null,
      refundedAt: tx.refundedAt || null,
      generatedAt: new Date().toISOString(),
    },
  });
});

// ============================
// MODULE 27 — DIGITAL TRAVEL WALLET
// ============================
const listWalletDocuments = asyncHandler(async (req, res) => {
  const tripId = sanitizeString(req.query.tripId || "", 80);
  const category = sanitizeString(req.query.category || "", 40);
  const docs = await cStore.listUserWalletDocuments(req.user.id);
  const filtered = docs.filter((d) => {
    if (tripId && String(d.tripId) !== tripId) return false;
    if (category && category !== "ALL" && d.category !== category) return false;
    return true;
  });
  res.status(200).json({ success: true, count: filtered.length, data: filtered });
});

const uploadWalletDocument = asyncHandler(async (req, res) => {
  const title = sanitizeString(req.body?.title || "", 160);
  const category = sanitizeString(req.body?.category || "TRAVEL_DOCUMENT", 40);
  const referenceCode = sanitizeString(req.body?.referenceCode || "", 80);
  const referenceOrigin = sanitizeString(req.body?.referenceOrigin || "user-uploaded", 40);
  const providerName = sanitizeString(req.body?.providerName || "", 120);
  const eventDate = sanitizeString(req.body?.eventDate || "", 20);
  const notes = sanitizeString(req.body?.notes || "", 500);
  const tripId = sanitizeString(req.body?.tripId || "", 80);

  if (!title) {
    throw new ApiError(400, "Document title is required.");
  }

  const validCategories = [
    "HOTEL_CONFIRMATION",
    "FLIGHT_REF",
    "TRAIN_REF",
    "BUS_TICKET",
    "ACTIVITY_BOOKING",
    "PAYMENT_RECEIPT",
    "TRAVEL_DOCUMENT",
  ];
  if (!validCategories.includes(category)) {
    throw new ApiError(400, "Invalid wallet document category.");
  }

  const allowedOrigin = ["provider-issued", "user-uploaded"].includes(referenceOrigin)
    ? referenceOrigin
    : "user-uploaded";

  const created = await cStore.createWalletDocument({
    user: req.user.id,
    tripId,
    category,
    title,
    referenceCode,
    referenceOrigin: allowedOrigin,
    providerName,
    eventDate,
    notes,
    fileStoredName: req.file ? req.file.filename : "",
    fileOriginalName: req.file ? sanitizeString(req.file.originalname, 160) : "",
    fileMimeType: req.file ? req.file.mimetype : "",
    fileSizeBytes: req.file ? req.file.size : 0,
  });

  res.status(201).json({
    success: true,
    message: "Travel wallet document saved securely.",
    data: created,
  });
});

// STRICT owner-only authenticated download with path confinement
const downloadWalletFile = asyncHandler(async (req, res) => {
  const doc = await cStore.findWalletDocumentById(req.params.id);
  if (!doc) throw new ApiError(404, "Wallet document not found.");
  if (String(doc.user) !== String(req.user.id)) {
    throw new ApiError(403, "Access denied. Travel wallet documents are strictly private to their owner.");
  }
  if (!doc.fileStoredName || !/^[a-f0-9-]+\.(pdf|jpg|jpeg|png|webp)$/i.test(doc.fileStoredName)) {
    throw new ApiError(404, "No uploaded file attached to this wallet entry.");
  }

  const resolved = path.resolve(WALLET_UPLOAD_DIR, doc.fileStoredName);
  if (!resolved.startsWith(WALLET_UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    throw new ApiError(404, "Stored document file not found.");
  }

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  if (doc.fileMimeType) {
    res.setHeader("Content-Type", doc.fileMimeType);
  }
  return res.sendFile(resolved);
});

// Generate QR ONLY for valid internal-booking or provider-issued references (with clear disclosure)
const getWalletDocumentQr = asyncHandler(async (req, res) => {
  const doc = await cStore.findWalletDocumentById(req.params.id);
  if (!doc) throw new ApiError(404, "Wallet document not found.");
  if (String(doc.user) !== String(req.user.id)) {
    throw new ApiError(403, "Access denied to this wallet document.");
  }
  if (
    !doc.referenceCode ||
    !["internal-booking", "provider-issued"].includes(doc.referenceOrigin)
  ) {
    throw new ApiError(
      400,
      "QR codes are only generated for valid internal booking references or provider-issued PNRs.",
    );
  }

  const payload = JSON.stringify({
    platform: "Travelogia",
    category: doc.category,
    reference: doc.referenceCode,
    provider: doc.providerName || "",
    date: doc.eventDate || "",
    notice: "Reference lookup QR only — not an official airline/rail carrier boarding pass.",
  });

  const qrDataUrl = await QRCode.toDataURL(payload, { width: 240, margin: 2 });

  res.status(200).json({
    success: true,
    data: {
      documentId: doc._id,
      referenceCode: doc.referenceCode,
      referenceOrigin: doc.referenceOrigin,
      qrDataUrl,
      isOfficialTransportTicket: false,
      disclosure:
        "This QR code encodes your saved booking reference for quick lookup only. It is NOT an official airline, railway, or third-party carrier boarding pass.",
    },
  });
});

const deleteWalletDocument = asyncHandler(async (req, res) => {
  const doc = await cStore.findWalletDocumentById(req.params.id);
  if (!doc) throw new ApiError(404, "Wallet document not found.");
  if (String(doc.user) !== String(req.user.id)) {
    throw new ApiError(403, "You can only delete your own wallet documents.");
  }

  if (doc.fileStoredName && /^[a-f0-9-]+\.(pdf|jpg|jpeg|png|webp)$/i.test(doc.fileStoredName)) {
    const resolved = path.resolve(WALLET_UPLOAD_DIR, doc.fileStoredName);
    if (resolved.startsWith(WALLET_UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
      fs.unlinkSync(resolved);
    }
  }

  await cStore.deleteWalletDocument(doc._id);
  res.status(200).json({ success: true, message: "Wallet document removed." });
});

// ============================
// MODULE 28 — SMART TRAVEL NOTIFICATIONS & PREFERENCES
// ============================
const listNotificationsAndPrefs = asyncHandler(async (req, res) => {
  const [notifications, preferences] = await Promise.all([
    v2Store.listUserNotifications(req.user.id),
    cStore.getNotificationPreferences(req.user.id),
  ]);
  const unreadCount = notifications.filter((n) => !n.read).length;

  res.status(200).json({
    success: true,
    unreadCount,
    preferences,
    data: notifications,
  });
});

const markNotificationRead = asyncHandler(async (req, res) => {
  const updated = await v2Store.markNotificationRead(req.params.id, req.user.id);
  if (!updated) throw new ApiError(404, "Notification not found.");
  res.status(200).json({ success: true, data: updated });
});

const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const allowedKeys = [
    "bookingConfirmations",
    "paymentUpdates",
    "cancellationUpdates",
    "checkInReminders",
    "transportReminders",
    "activityReminders",
    "priceAlerts",
  ];
  const updates = {};
  for (const key of allowedKeys) {
    if (typeof req.body?.[key] === "boolean") {
      updates[key] = req.body[key];
    }
  }
  const prefs = await cStore.upsertNotificationPreferences(req.user.id, updates);
  res.status(200).json({ success: true, message: "Notification preferences updated.", data: prefs });
});

const triggerTravelRemindersNow = asyncHandler(async (req, res) => {
  const summary = await runUpcomingTravelReminders();
  res.status(200).json({ success: true, data: summary });
});

// ============================
// MODULE 25 — UNIFIED TRIP DASHBOARD
// ============================
const getUnifiedTripDashboard = asyncHandler(async (req, res) => {
  const tripId = sanitizeString(req.query.tripId || "", 80);
  const filterByTrip = (arr) => (tripId ? arr.filter((x) => String(x.tripId || x._id) === tripId) : arr);

  const [
    stayBookings,
    transportReservations,
    activityBookings,
    guideBookings,
    restaurantReservations,
    destinationBookings,
    itineraries,
    budgets,
    collabTrips,
    payments,
    journals,
    walletDocuments,
    notifications,
  ] = await Promise.all([
    cStore.listUserStayBookings(req.user.id),
    cStore.listUserTransportReservations(req.user.id),
    cStore.listUserActivityBookings(req.user.id),
    cStore.listUserGuideBookings(req.user.id),
    cStore.listUserRestaurantReservations(req.user.id),
    store.listUserBookings(req.user.id),
    v2Store.listUserItineraries(req.user.id),
    v2Store.listUserBudgets(req.user.id),
    v2Store.listUserCollabTrips(req.user.id),
    cStore.listUserPayments(req.user.id),
    v2Store.listUserJournals(req.user.id),
    cStore.listUserWalletDocuments(req.user.id),
    v2Store.listUserNotifications(req.user.id),
  ]);

  const stays = filterByTrip(stayBookings);
  const transport = filterByTrip(transportReservations);
  const activities = filterByTrip(activityBookings);
  const guides = filterByTrip(guideBookings);
  const restaurants = filterByTrip(restaurantReservations);
  const wallet = filterByTrip(walletDocuments);
  const txList = filterByTrip(payments);

  const activeTotalINR =
    stays.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + Number(b.totalAmount || 0), 0) +
    transport.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + Number(b.totalAmount || 0), 0) +
    activities.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + Number(b.totalAmount || 0), 0) +
    guides.filter((b) => b.status !== "CANCELLED").reduce((s, b) => s + Number(b.totalAmount || 0), 0);

  const paidTotalINR = txList
    .filter((p) => p.status === "PAID")
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  res.status(200).json({
    success: true,
    tripFilter: tripId || null,
    summary: {
      stayCount: stays.length,
      transportCount: transport.length,
      activityCount: activities.length,
      guideCount: guides.length,
      restaurantCount: restaurants.length,
      itineraryCount: itineraries.length,
      budgetCount: budgets.length,
      journalCount: journals.length,
      walletCount: wallet.length,
      unreadNotifications: notifications.filter((n) => !n.read).length,
      activeReservationTotalINR: activeTotalINR,
      verifiedPaidTotalINR: paidTotalINR,
    },
    data: {
      collabTrips,
      stays,
      transport,
      activities,
      guides,
      restaurants,
      destinationBookings,
      itineraries,
      budgets,
      payments: txList,
      journals,
      walletDocuments: wallet,
      notifications: notifications.slice(0, 15),
    },
  });
});

// ============================
// MODULE 29 — TRAVEL INSURANCE DISCOVERY (Strictly Informational Redirects)
// ============================
const listInsuranceProviders = asyncHandler(async (req, res) => {
  const region = sanitizeString(req.query.region || "", 60).toLowerCase();
  const data = seed.INSURANCE_PROVIDERS_REFERENCE.filter(
    (p) => !region || p.regionFocus.toLowerCase().includes(region),
  );

  res.status(200).json({
    success: true,
    underwritingProvided: false,
    aiInsuranceAdvice: false,
    disclosure:
      "Travelogia is an informational discovery directory only. We do not underwrite, issue, or guarantee insurance policies, and we do not provide AI-generated insurance advice. Obtain binding quotes and review full policy wording directly on each licensed insurer's official portal.",
    count: data.length,
    data,
  });
});

module.exports = {
  WALLET_UPLOAD_DIR,
  getPaymentGatewayConfig,
  createPaymentOrder,
  verifyPayment,
  handlePaymentWebhook,
  refundPayment,
  listPaymentHistory,
  getPaymentInvoice,
  listWalletDocuments,
  uploadWalletDocument,
  downloadWalletFile,
  getWalletDocumentQr,
  deleteWalletDocument,
  listNotificationsAndPrefs,
  markNotificationRead,
  updateNotificationPreferences,
  triggerTravelRemindersNow,
  getUnifiedTripDashboard,
  listInsuranceProviders,
};

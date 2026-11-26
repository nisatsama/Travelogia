const crypto = require("crypto");
const Razorpay = require("razorpay");
const env = require("../config/env");
const ApiError = require("../utils/ApiError");
const { PAYMENT_STATUS, BOOKING_STATUS } = require("../constants/commerceStates");
const cStore = require("./commerceStoreService");
const store = require("./storeService");
const { notifyUser } = require("./notificationService");

function setRazorpayClientForTesting(mockClient) {
  if (env.isTest) {
    globalThis.__TRAVELOGIA_RAZORPAY_CLIENT__ = mockClient;
  }
}

function getRazorpayConfig() {
  const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || "";
  const keySecret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET || "";
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_WEBHOOK_SECRET || "";
  return {
    keyId,
    keySecret,
    webhookSecret,
    configured: Boolean(keyId && keySecret),
  };
}

function getRazorpayClient() {
  if (env.isTest && globalThis.__TRAVELOGIA_RAZORPAY_CLIENT__) {
    return globalThis.__TRAVELOGIA_RAZORPAY_CLIENT__;
  }
  const { keyId, keySecret, configured } = getRazorpayConfig();
  if (!configured) {
    throw new ApiError(
      503,
      "Razorpay gateway is not configured on this server. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Settings > Secrets to initiate real payments.",
    );
  }
  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

// Resolve authoritative booking & server-side payable amount (NEVER trust client amounts)
async function resolvePayableBooking({ bookingType, bookingId, userId }) {
  let booking = null;
  let amount = 0;
  let currency = "INR";
  let bookingReference = "";
  let tripId = "";

  if (bookingType === "STAY") {
    booking = await cStore.findStayBookingById(bookingId);
    if (booking) {
      amount = Number(booking.totalAmount);
      currency = booking.currency || "INR";
      bookingReference = booking.bookingReference;
      tripId = booking.tripId || "";
    }
  } else if (bookingType === "BUS" || bookingType === "CAR_RENTAL") {
    booking = await cStore.findTransportReservationById(bookingId);
    if (booking) {
      amount = Number(booking.totalAmount);
      currency = booking.currency || "INR";
      bookingReference = booking.bookingReference;
      tripId = booking.tripId || "";
    }
  } else if (bookingType === "ACTIVITY") {
    booking = await cStore.findActivityBookingById(bookingId);
    if (booking) {
      amount = Number(booking.totalAmount);
      currency = booking.currency || "INR";
      bookingReference = booking.bookingReference;
      tripId = booking.tripId || "";
    }
  } else if (bookingType === "GUIDE") {
    booking = await cStore.findGuideBookingById(bookingId);
    if (booking) {
      amount = Number(booking.totalAmount);
      currency = booking.currency || "INR";
      bookingReference = booking.bookingReference;
      tripId = booking.tripId || "";
    }
  } else if (bookingType === "TOUR") {
    booking = await store.findBookingById(bookingId);
    if (booking) {
      amount = Number(booking.totalCost);
      currency = "USD";
      bookingReference = String(booking._id);
    }
  } else {
    throw new ApiError(400, "Unsupported bookingType for payment.");
  }

  if (!booking) {
    throw new ApiError(404, "Target booking not found.");
  }
  if (String(booking.user) !== String(userId)) {
    throw new ApiError(403, "You can only pay for your own reservations.");
  }
  if (booking.status === BOOKING_STATUS.CANCELLED || booking.status === "cancelled") {
    throw new ApiError(409, "Cancelled bookings cannot be paid.");
  }
  if (booking.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(409, "This booking has already been paid.");
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new ApiError(400, "Booking does not have a valid payable amount.");
  }

  return { booking, amount, currency, bookingReference, tripId };
}

async function syncBookingPaymentStatus({ bookingType, bookingId, paymentStatus, transactionId }) {
  const updates = { paymentStatus, paymentTransactionId: transactionId || "" };
  if (bookingType === "STAY") {
    await cStore.updateStayBooking(bookingId, updates);
  } else if (bookingType === "BUS" || bookingType === "CAR_RENTAL") {
    await cStore.updateTransportReservation(bookingId, updates);
  } else if (bookingType === "ACTIVITY") {
    await cStore.updateActivityBooking(bookingId, updates);
  } else if (bookingType === "GUIDE") {
    await cStore.updateGuideBooking(bookingId, updates);
  }
}

function timingSafeHexEqual(expectedHex, actualHex) {
  if (!expectedHex || !actualHex || typeof actualHex !== "string") return false;
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(actualHex.trim(), "hex");
    if (a.length === 0 || a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function createRazorpayOrder({ bookingType, bookingId, userId }) {
  const resolved = await resolvePayableBooking({ bookingType, bookingId, userId });
  const client = getRazorpayClient();
  const { keyId } = getRazorpayConfig();

  const amountSubunits = Math.round(resolved.amount * 100);
  const receipt = `TRV-${resolved.bookingReference}`.slice(0, 40);

  let order;
  try {
    order = await client.orders.create({
      amount: amountSubunits,
      currency: resolved.currency,
      receipt,
      notes: {
        bookingType,
        bookingId: String(bookingId),
        bookingReference: resolved.bookingReference,
        userId: String(userId),
      },
    });
  } catch (err) {
    throw new ApiError(
      502,
      `Razorpay order creation failed: ${err?.error?.description || err.message || "Upstream gateway error."}`,
    );
  }

  const transaction = await cStore.createPaymentTransaction({
    user: String(userId),
    tripId: resolved.tripId,
    bookingType,
    bookingId: String(bookingId),
    bookingReference: resolved.bookingReference,
    gateway: "razorpay",
    mode: "live-sdk",
    razorpayOrderId: order.id,
    amount: resolved.amount,
    amountSubunits,
    currency: resolved.currency,
    status: PAYMENT_STATUS.ORDER_CREATED,
  });

  await syncBookingPaymentStatus({
    bookingType,
    bookingId,
    paymentStatus: PAYMENT_STATUS.ORDER_CREATED,
    transactionId: transaction._id,
  });

  return {
    transaction,
    checkout: {
      keyId: keyId || (env.isTest ? "rzp_test_mock" : ""),
      orderId: order.id,
      amount: amountSubunits,
      currency: resolved.currency,
      bookingReference: resolved.bookingReference,
      name: "Travelogia Commerce",
      description: `${bookingType} Reservation ${resolved.bookingReference}`,
    },
  };
}

// Cryptographic server-side Razorpay payment verification (NEVER trusts client-only success claims)
async function verifyRazorpayPayment({
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature,
  userId,
}) {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    throw new ApiError(
      400,
      "razorpayOrderId, razorpayPaymentId, and razorpaySignature are all required for server verification.",
    );
  }

  const tx = await cStore.findPaymentByOrderId(String(razorpayOrderId));
  if (!tx) {
    throw new ApiError(404, "Payment order record not found.");
  }
  if (String(tx.user) !== String(userId)) {
    throw new ApiError(403, "You are not authorized to verify this payment order.");
  }
  if (tx.status === PAYMENT_STATUS.PAID && tx.signatureVerified) {
    return { transaction: tx, alreadyVerified: true };
  }

  const { keySecret } = getRazorpayConfig();
  if (!keySecret) {
    throw new ApiError(
      503,
      "Razorpay verification secret is not configured on the server.",
    );
  }

  const expectedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (!timingSafeHexEqual(expectedSignature, razorpaySignature)) {
    await cStore.updatePaymentTransaction(tx._id, {
      status: PAYMENT_STATUS.FAILED,
      signatureVerified: false,
    });
    await syncBookingPaymentStatus({
      bookingType: tx.bookingType,
      bookingId: tx.bookingId,
      paymentStatus: PAYMENT_STATUS.FAILED,
      transactionId: tx._id,
    });
    throw new ApiError(
      400,
      "Payment signature verification failed. Booking has NOT been marked as paid.",
    );
  }

  const updated = await cStore.updatePaymentTransaction(tx._id, {
    razorpayPaymentId: String(razorpayPaymentId),
    signatureVerified: true,
    status: PAYMENT_STATUS.PAID,
    paidAt: new Date().toISOString(),
  });

  await syncBookingPaymentStatus({
    bookingType: tx.bookingType,
    bookingId: tx.bookingId,
    paymentStatus: PAYMENT_STATUS.PAID,
    transactionId: tx._id,
  });

  // Add automatic verified payment receipt into Digital Travel Wallet
  await cStore.createWalletDocument({
    user: String(tx.user),
    tripId: tx.tripId || "",
    category: "PAYMENT_RECEIPT",
    title: `Payment Receipt ${updated.invoiceNumber} (${tx.bookingReference})`,
    referenceCode: updated.invoiceNumber,
    referenceOrigin: "internal-booking",
    providerName: "Razorpay / Travelogia",
    eventDate: new Date().toISOString().slice(0, 10),
    notes: `Verified payment ${razorpayPaymentId} for ${tx.currency} ${tx.amount}`,
  });

  await notifyUser({
    userId: tx.user,
    type: "payment-update",
    title: `Payment Verified: ${updated.invoiceNumber}`,
    message: `Your payment of ${tx.currency} ${tx.amount} for ${tx.bookingReference} was verified server-side.`,
    relatedId: updated._id,
  });

  return { transaction: updated, alreadyVerified: false };
}

// Signed Razorpay webhook verification using raw request bytes + X-Razorpay-Signature
async function handleRazorpayWebhook({ rawBody, signatureHeader }) {
  const { webhookSecret } = getRazorpayConfig();
  if (!webhookSecret) {
    throw new ApiError(503, "RAZORPAY_WEBHOOK_SECRET is not configured on the server.");
  }
  if (!signatureHeader || !rawBody) {
    throw new ApiError(400, "Missing webhook signature or payload.");
  }

  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");

  if (!timingSafeHexEqual(expected, signatureHeader)) {
    throw new ApiError(400, "Invalid Razorpay webhook signature.");
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new ApiError(400, "Malformed webhook JSON body.");
  }

  const eventType = event?.event || "";
  const paymentEntity = event?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;

  if (!orderId) {
    return { handled: false, eventType };
  }

  const tx = await cStore.findPaymentByOrderId(orderId);
  if (!tx) {
    return { handled: false, eventType, reason: "Order not tracked" };
  }

  if (eventType === "payment.captured") {
    const updated = await cStore.updatePaymentTransaction(tx._id, {
      razorpayPaymentId: paymentEntity.id || tx.razorpayPaymentId,
      webhookVerified: true,
      status: PAYMENT_STATUS.PAID,
      paidAt: tx.paidAt || new Date().toISOString(),
    });
    await syncBookingPaymentStatus({
      bookingType: tx.bookingType,
      bookingId: tx.bookingId,
      paymentStatus: PAYMENT_STATUS.PAID,
      transactionId: tx._id,
    });
    await notifyUser({
      userId: tx.user,
      type: "payment-update",
      title: `Payment Captured (${updated.invoiceNumber})`,
      message: `Webhook confirmed payment capture for ${tx.bookingReference}.`,
      relatedId: updated._id,
    });
    return { handled: true, eventType, status: PAYMENT_STATUS.PAID };
  }

  if (eventType === "payment.failed") {
    await cStore.updatePaymentTransaction(tx._id, {
      webhookVerified: true,
      status: PAYMENT_STATUS.FAILED,
    });
    await syncBookingPaymentStatus({
      bookingType: tx.bookingType,
      bookingId: tx.bookingId,
      paymentStatus: PAYMENT_STATUS.FAILED,
      transactionId: tx._id,
    });
    return { handled: true, eventType, status: PAYMENT_STATUS.FAILED };
  }

  return { handled: true, eventType };
}

async function refundRazorpayPayment({ transactionId, userId, isAdmin = false, reason = "Customer requested cancellation" }) {
  const tx = await cStore.findPaymentById(transactionId);
  if (!tx) throw new ApiError(404, "Payment transaction not found.");
  if (!isAdmin && String(tx.user) !== String(userId)) {
    throw new ApiError(403, "You do not have permission to refund this transaction.");
  }
  if (tx.status !== PAYMENT_STATUS.PAID || !tx.razorpayPaymentId) {
    throw new ApiError(400, "Only verified PAID Razorpay transactions can be refunded.");
  }

  const client = getRazorpayClient();
  let refund;
  try {
    refund = await client.payments.refund(tx.razorpayPaymentId, {
      amount: tx.amountSubunits,
      notes: { reason: String(reason).slice(0, 120), invoiceNumber: tx.invoiceNumber },
    });
  } catch (err) {
    throw new ApiError(
      502,
      `Razorpay refund failed: ${err?.error?.description || err.message || "Gateway refund error."}`,
    );
  }

  const updated = await cStore.updatePaymentTransaction(tx._id, {
    status: PAYMENT_STATUS.REFUNDED,
    refundId: refund.id || cStore.createRef("RFND"),
    refundAmount: tx.amount,
    refundReason: String(reason).slice(0, 200),
    refundedAt: new Date().toISOString(),
  });

  await syncBookingPaymentStatus({
    bookingType: tx.bookingType,
    bookingId: tx.bookingId,
    paymentStatus: PAYMENT_STATUS.REFUNDED,
    transactionId: tx._id,
  });

  await notifyUser({
    userId: tx.user,
    type: "payment-update",
    title: `Refund Processed: ${tx.invoiceNumber}`,
    message: `Refund of ${tx.currency} ${tx.amount} initiated via Razorpay (${updated.refundId}).`,
    relatedId: updated._id,
  });

  return updated;
}

module.exports = {
  getRazorpayConfig,
  setRazorpayClientForTesting,
  createRazorpayOrder,
  verifyRazorpayPayment,
  handleRazorpayWebhook,
  refundRazorpayPayment,
};

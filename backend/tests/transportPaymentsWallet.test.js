import crypto from "crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import v2Store from "../services/v2StoreService.js";
import cStore from "../services/commerceStoreService.js";
import paymentService from "../services/paymentService.js";

async function registerAndLogin(email, username = "User") {
  await request(app).post("/api/signup").send({
    username,
    email,
    password: "Password123!",
  });
  const res = await request(app).post("/api/login").send({
    email,
    password: "Password123!",
  });
  return { token: res.body.token, user: res.body.user };
}

describe("Modules 17–21 & 25–29: Transport, Razorpay Payments, Digital Wallet, Notifications, Dashboard & Insurance", () => {
  const TEST_KEY_SECRET = "rzp_test_secret_unit_12345";
  const TEST_WEBHOOK_SECRET = "rzp_webhook_secret_unit_67890";

  beforeEach(() => {
    store.resetMemoryStore();
    v2Store.resetV2MemoryStore();
    cStore.resetCommerceMemoryStore();

    process.env.RAZORPAY_KEY_ID = "rzp_test_key_unit";
    process.env.RAZORPAY_KEY_SECRET = TEST_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

    paymentService.setRazorpayClientForTesting({
      orders: {
        create: async (opts) => ({
          id: `order_mock_${crypto.randomBytes(4).toString("hex")}`,
          amount: opts.amount,
          currency: opts.currency,
          receipt: opts.receipt,
          status: "created",
        }),
      },
      payments: {
        refund: async (paymentId, opts) => ({
          id: `rfnd_mock_${crypto.randomBytes(4).toString("hex")}`,
          payment_id: paymentId,
          amount: opts.amount,
          status: "processed",
        }),
      },
    });
  });

  afterEach(() => {
    paymentService.setRazorpayClientForTesting(null);
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("returns honest non-fabricated Flight redirect & Train IRCTC responses and prevents bus seat double-booking", async () => {
    const { token } = await registerAndLogin("commuter@test.com", "Commuter");

    // Module 17: Flights — never fabricates fares or flights when no live provider configured
    const flt = await request(app).get(
      "/api/transport/flights/search?origin=CCU&destination=IXB&departureDate=2027-05-10&passengers=2",
    );
    expect(flt.status).toBe(200);
    expect(flt.body.liveFaresAvailable).toBe(false);
    expect(flt.body.flights).toEqual([]);
    expect(flt.body.externalComparisonPortals.length).toBeGreaterThanOrEqual(3);

    // Module 18: Trains — never fabricates live IRCTC seat availability
    const trn = await request(app).get("/api/transport/trains/search?from=HWH&to=NJP");
    expect(trn.status).toBe(200);
    expect(trn.body.liveSeatAvailability).toBe(false);
    expect(trn.body.officialPortals.irctcBooking).toContain("irctc.co.in");
    expect(trn.body.data.length).toBeGreaterThanOrEqual(1);

    // Save external PNR references to Unified Transport Timeline
    const saveFlt = await request(app)
      .post("/api/transport/flights/save-reference")
      .set("Authorization", `Bearer ${token}`)
      .send({
        pnr: "IND98X",
        airline: "IndiGo",
        flightNumber: "6E-612",
        origin: "CCU",
        destination: "IXB",
        travelDate: "2027-05-10",
      });
    expect(saveFlt.status).toBe(201);

    // Module 19: Bus booking seat lock + sleeper modifier pricing
    // bus-kol-slg-1 farePerSeat = 1150, row 1 seats are sleeper (+150 each) => 2 * 1300 = 2600
    const bus1 = await request(app)
      .post("/api/transport/buses/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        routeId: "bus-kol-slg-1",
        travelDate: "2027-05-12",
        seatNumbers: ["1A", "1B"],
        boardingPoint: "Esplanade Bus Terminus",
      });
    expect(bus1.status).toBe(201);
    expect(bus1.body.data.totalAmount).toBe(2600);

    // Double-booking seat 1B on same route & date must fail with 409
    const busConflict = await request(app)
      .post("/api/transport/buses/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        routeId: "bus-kol-slg-1",
        travelDate: "2027-05-12",
        seatNumbers: ["1B", "2A"],
      });
    expect(busConflict.status).toBe(409);

    // Module 20: Car rental server-side pricing
    const car1 = await request(app)
      .post("/api/transport/cars/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        vehicleId: "car-slg-suv",
        travelDate: "2027-05-13",
        pickupLocation: "Bagdogra Airport",
        dropoffLocation: "Darjeeling Mall",
        rentalDays: 3,
      });
    expect(car1.status).toBe(201);
    expect(car1.body.data.totalAmount).toBe(4200 * 3);

    // Module 21: Unified transport timeline aggregates all modes
    const timeline = await request(app)
      .get("/api/transport/reservations/mine")
      .set("Authorization", `Bearer ${token}`);
    expect(timeline.status).toBe(200);
    expect(timeline.body.data.length).toBe(3);
  });

  it("enforces server-side Razorpay order totals, HMAC verification, signed webhooks & refunds (Module 26)", async () => {
    const { token } = await registerAndLogin("payer@test.com", "Payer");

    const stay = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        propertyId: "prop-ziro-homestay",
        roomTypeId: "room-ziro-double",
        checkInDate: "2027-06-10",
        checkOutDate: "2027-06-12",
        guests: 2,
        roomsBooked: 1,
      });
    expect(stay.status).toBe(201);
    const stayId = stay.body.data._id;
    const expectedAmount = stay.body.data.totalAmount;

    // Order creation uses authoritative server amount, never client-submitted amount
    const orderRes = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingType: "STAY", bookingId: stayId, amount: 1 });
    expect(orderRes.status).toBe(201);
    const tx = orderRes.body.data.transaction;
    expect(tx.amount).toBe(expectedAmount);
    expect(tx.status).toBe("ORDER_CREATED");

    // Tampered / invalid signature MUST fail (400) and NOT mark booking PAID
    const badVerify = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({
        razorpayOrderId: tx.razorpayOrderId,
        razorpayPaymentId: "pay_fake_123",
        razorpaySignature: "0000000000000000000000000000000000000000000000000000000000000000",
      });
    expect(badVerify.status).toBe(400);

    // Valid HMAC-SHA256 signature marks payment & booking PAID and generates invoice
    const validPaymentId = "pay_verified_999";
    const validSig = crypto
      .createHmac("sha256", TEST_KEY_SECRET)
      .update(`${tx.razorpayOrderId}|${validPaymentId}`)
      .digest("hex");

    const okVerify = await request(app)
      .post("/api/payments/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({
        razorpayOrderId: tx.razorpayOrderId,
        razorpayPaymentId: validPaymentId,
        razorpaySignature: validSig,
      });
    expect(okVerify.status).toBe(200);
    expect(okVerify.body.data.status).toBe("PAID");
    expect(okVerify.body.data.signatureVerified).toBe(true);

    // Invoice endpoint works
    const inv = await request(app)
      .get(`/api/payments/${tx._id}/invoice`)
      .set("Authorization", `Bearer ${token}`);
    expect(inv.status).toBe(200);
    expect(inv.body.invoice.invoiceNumber).toBe(tx.invoiceNumber);
    expect(inv.body.invoice.paymentStatus).toBe("PAID");

    // Refund workflow transitions payment & booking to REFUNDED
    const refund = await request(app)
      .post(`/api/payments/${tx._id}/refund`)
      .set("Authorization", `Bearer ${token}`)
      .send({ reason: "Plans changed" });
    expect(refund.status).toBe(200);
    expect(refund.body.data.status).toBe("REFUNDED");

    // Signed webhook test on a second order
    const bus = await request(app)
      .post("/api/transport/buses/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        routeId: "bus-ghy-shl-1",
        travelDate: "2027-06-15",
        seatNumbers: ["3A"],
      });
    const order2 = await request(app)
      .post("/api/payments/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ bookingType: "BUS", bookingId: bus.body.data._id });
    const order2Id = order2.body.data.transaction.razorpayOrderId;

    const webhookPayload = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_webhook_777", order_id: order2Id } } },
    });

    // Invalid webhook signature rejected 400
    const badWh = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", "deadbeef")
      .send(webhookPayload);
    expect(badWh.status).toBe(400);

    // Valid signed webhook succeeds
    const validWhSig = crypto
      .createHmac("sha256", TEST_WEBHOOK_SECRET)
      .update(webhookPayload)
      .digest("hex");
    const goodWh = await request(app)
      .post("/api/payments/webhook")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", validWhSig)
      .send(webhookPayload);
    expect(goodWh.status).toBe(200);
    expect(goodWh.body.data.status).toBe("PAID");
  });

  it("secures Digital Travel Wallet (owner-only files & honest QR), Smart Reminders, Unified Dashboard & Insurance Discovery (Modules 25, 27, 28, 29)", async () => {
    const { token: ownerToken } = await registerAndLogin("wallet-owner@test.com", "Owner");
    const { token: intruderToken } = await registerAndLogin("wallet-intruder@test.com", "Intruder");

    // Create a stay checking in tomorrow so reminder scheduler picks it up
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);

    const stay = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        propertyId: "prop-manali-hostel",
        roomTypeId: "room-manali-double",
        checkInDate: tomorrow,
        checkOutDate: dayAfter,
        guests: 2,
        roomsBooked: 1,
      });
    expect(stay.status).toBe(201);

    // Module 27: Upload private PDF to wallet
    const uploadRes = await request(app)
      .post("/api/wallet")
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("title", "Passport Copy")
      .field("category", "TRAVEL_DOCUMENT")
      .field("referenceOrigin", "user-uploaded")
      .attach("file", Buffer.from("%PDF-1.4\n%test-doc\n"), {
        filename: "passport.pdf",
        contentType: "application/pdf",
      });
    expect(uploadRes.status).toBe(201);
    const uploadedId = uploadRes.body.data._id;

    // Reject disallowed MIME type (.txt)
    const badUpload = await request(app)
      .post("/api/wallet")
      .set("Authorization", `Bearer ${ownerToken}`)
      .field("title", "Malicious Script")
      .attach("file", Buffer.from("not-allowed"), {
        filename: "evil.txt",
        contentType: "text/plain",
      });
    expect(badUpload.status).toBe(400);

    // Owner can download private file; another user is strictly blocked (403)
    const ownerDl = await request(app)
      .get(`/api/wallet/${uploadedId}/file`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerDl.status).toBe(200);

    const intruderDl = await request(app)
      .get(`/api/wallet/${uploadedId}/file`)
      .set("Authorization", `Bearer ${intruderToken}`);
    expect(intruderDl.status).toBe(403);

    // QR code rejected for personal user-uploaded doc without provider/internal ref (400)
    const noQr = await request(app)
      .get(`/api/wallet/${uploadedId}/qr`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(noQr.status).toBe(400);

    // QR code succeeds for auto-created internal stay confirmation with explicit non-official-ticket disclosure
    const walletList = await request(app)
      .get("/api/wallet")
      .set("Authorization", `Bearer ${ownerToken}`);
    const stayDoc = walletList.body.data.find((d) => d.category === "HOTEL_CONFIRMATION");
    expect(stayDoc).toBeTruthy();

    const qrRes = await request(app)
      .get(`/api/wallet/${stayDoc._id}/qr`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.data.qrDataUrl).toContain("data:image/png;base64,");
    expect(qrRes.body.data.isOfficialTransportTicket).toBe(false);

    // Module 28: Run upcoming reminders & update preferences
    const remRes = await request(app)
      .post("/api/notifications/run-reminders")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(remRes.status).toBe(200);
    expect(remRes.body.data.remindersCreated).toBeGreaterThanOrEqual(1);

    const prefRes = await request(app)
      .put("/api/notifications/preferences")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ priceAlerts: false });
    expect(prefRes.status).toBe(200);
    expect(prefRes.body.data.priceAlerts).toBe(false);

    // Module 25: Unified Trip Dashboard aggregates everything for authenticated user
    const dashRes = await request(app)
      .get("/api/dashboard")
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.summary.stayCount).toBe(1);
    expect(dashRes.body.summary.walletCount).toBeGreaterThanOrEqual(2);
    expect(dashRes.body.data.notifications.length).toBeGreaterThanOrEqual(2);

    // Module 29: Travel Insurance Discovery — strictly non-advisory external redirects
    const insRes = await request(app).get("/api/insurance/providers");
    expect(insRes.status).toBe(200);
    expect(insRes.body.underwritingProvided).toBe(false);
    expect(insRes.body.aiInsuranceAdvice).toBe(false);
    expect(insRes.body.data.length).toBeGreaterThanOrEqual(4);
  });
});

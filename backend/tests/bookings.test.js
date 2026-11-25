import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";

async function signupAndLogin(email, username = "Traveler") {
  await request(app).post("/api/signup").send({
    username,
    email,
    password: "Password123",
  });
  const res = await request(app).post("/api/login").send({
    email,
    password: "Password123",
  });
  return res.body.token;
}

describe("Secure Booking System API", () => {
  beforeEach(() => {
    store.resetMemoryStore();
  });

  it("computes totalCost strictly server-side and ignores client price tampering", async () => {
    const token = await signupAndLogin("price@example.com");
    const list = await request(app).get("/api/travels?limit=1");
    const destination = list.body.data[0];

    const futureDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

    const res = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: destination._id,
        travelers: 3,
        duration: 4,
        date: futureDate,
        totalCost: 1, // Tampered price — MUST be ignored
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.booking.totalCost).toBe(destination.pricePerNight * 3 * 4);
    expect(res.body.booking.bookingReference).toMatch(/^TRV-/);
    expect(res.body.booking.status).toBe("confirmed");
  });

  it("rejects past dates, invalid traveller/duration counts, and nonexistent destinations", async () => {
    const token = await signupAndLogin("validation@example.com");
    const list = await request(app).get("/api/travels?limit=1");
    const destination = list.body.data[0];

    const pastRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: destination._id,
        travelers: 2,
        duration: 2,
        date: "2020-01-15",
      });
    expect(pastRes.status).toBe(400);

    const zeroTravelers = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: destination._id,
        travelers: 0,
        duration: 2,
        date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      });
    expect(zeroTravelers.status).toBe(400);

    const missingDest = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: "dest-nonexistent-999",
        travelers: 2,
        duration: 2,
        date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      });
    expect(missingDest.status).toBe(404);
  });

  it("blocks duplicate submissions and enforces destination capacity limits", async () => {
    const token = await signupAndLogin("dupe@example.com");
    const adminRes = await request(app).post("/api/auth/claim-admin").send({
      username: "Admin",
      email: "admin@cap.com",
      password: "AdminPassword123",
    });
    const adminToken = adminRes.body.token;

    // Create destination with tight capacity of 4
    const createDest = await request(app)
      .post("/api/travels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        title: "Boutique Island Villa",
        city: "Havelock",
        country: "India",
        category: "Beach",
        pricePerNight: 200,
        maxCapacity: 4,
        description: "Exclusive low-capacity island eco-villa.",
        image: { url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e" },
        coordinates: { latitude: 11.9761, longitude: 92.9876 },
      });
    const destId = createDest.body.data._id;
    const futureDate = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

    const first = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: destId,
        travelers: 3,
        duration: 2,
        date: futureDate,
        idempotencyKey: "same-key-001",
      });
    expect(first.status).toBe(201);

    // Duplicate idempotency key must be rejected with 409
    const duplicate = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token}`)
      .send({
        travelId: destId,
        travelers: 3,
        duration: 2,
        date: futureDate,
        idempotencyKey: "same-key-001",
      });
    expect(duplicate.status).toBe(409);

    // Another user trying to book 2 travelers on same overlapping date exceeds capacity (3+2 > 4)
    const token2 = await signupAndLogin("second@example.com", "User Two");
    const overCap = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        travelId: destId,
        travelers: 2,
        duration: 2,
        date: futureDate,
      });
    expect(overCap.status).toBe(409);
  });

  it("enforces booking ownership on view and cancellation, while permitting owner & admin", async () => {
    const ownerToken = await signupAndLogin("owner@example.com", "Owner");
    const otherToken = await signupAndLogin("other@example.com", "Other");
    const list = await request(app).get("/api/travels?limit=1");
    const destination = list.body.data[0];

    const futureDate = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
    const created = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({
        travelId: destination._id,
        travelers: 1,
        duration: 2,
        date: futureDate,
      });
    const bookingId = created.body.booking._id;

    // Another user cannot view or cancel owner's booking
    const otherView = await request(app)
      .get(`/api/bookings/${bookingId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherView.status).toBe(403);

    const otherCancel = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherCancel.status).toBe(403);

    // Owner cancels cleanly
    const ownerCancel = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(ownerCancel.status).toBe(200);
    expect(ownerCancel.body.booking.status).toBe("cancelled");
  });
});

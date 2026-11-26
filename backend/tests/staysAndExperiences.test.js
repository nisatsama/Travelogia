import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import v2Store from "../services/v2StoreService.js";
import cStore from "../services/commerceStoreService.js";

async function registerAndLogin(email, username = "Traveller") {
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

async function createAdmin() {
  const res = await request(app).post("/api/auth/claim-admin").send({
    username: "AdminBoss",
    email: "admin-stays@test.com",
    password: "AdminPassword123!",
  });
  return res.body.token;
}

describe("Modules 13–16 & 22–24: Stays, Room Inventory, Reviews, Activities, Guides & Dining", () => {
  beforeEach(() => {
    store.resetMemoryStore();
    v2Store.resetV2MemoryStore();
    cStore.resetCommerceMemoryStore();
  });

  it("searches properties across hotels, homestays, villas, hostels, resorts, guesthouses & apartments", async () => {
    const allRes = await request(app).get("/api/stays");
    expect(allRes.status).toBe(200);
    expect(allRes.body.data.length).toBeGreaterThanOrEqual(7);
    const types = new Set(allRes.body.data.map((p) => p.propertyType));
    expect(types.has("Hotel")).toBe(true);
    expect(types.has("Homestay")).toBe(true);
    expect(types.has("Villa")).toBe(true);
    expect(types.has("Resort")).toBe(true);
    expect(types.has("Hostel")).toBe(true);
    expect(types.has("Guesthouse")).toBe(true);
    expect(types.has("Apartment")).toBe(true);

    const homestayRes = await request(app).get("/api/stays?propertyType=Homestay&city=Ziro");
    expect(homestayRes.status).toBe(200);
    expect(homestayRes.body.data.length).toBe(1);
    expect(homestayRes.body.data[0].hostProfile.verifiedHost).toBe(true);
  });

  it("enforces server-side seasonal pricing, prevents double-booking atomically, and restores inventory on cancel", async () => {
    const { token: token1 } = await registerAndLogin("guest1@test.com", "Guest1");
    const { token: token2 } = await registerAndLogin("guest2@test.com", "Guest2");

    // room-darj-family has basePricePerNight=8800, totalQuantity=2, April multiplier=1.20
    // 2 nights x 2 rooms x (8800 * 1.2 = 10560) = 42240 subtotal + 12% tax (5069) = 47309
    const book1 = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${token1}`)
      .send({
        propertyId: "prop-darjeeling-hotel",
        roomTypeId: "room-darj-family",
        checkInDate: "2027-04-10",
        checkOutDate: "2027-04-12",
        guests: 6,
        roomsBooked: 2,
        totalAmount: 1, // malicious client override must be ignored
      });

    expect(book1.status).toBe(201);
    expect(book1.body.data.subtotal).toBe(42240);
    expect(book1.body.data.taxAmount).toBe(5069);
    expect(book1.body.data.totalAmount).toBe(47309);

    // Concurrent / overlapping reservation for same room & dates must fail with 409 Conflict
    const doubleBook = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        propertyId: "prop-darjeeling-hotel",
        roomTypeId: "room-darj-family",
        checkInDate: "2027-04-11",
        checkOutDate: "2027-04-13",
        guests: 2,
        roomsBooked: 1,
      });
    expect(doubleBook.status).toBe(409);

    // Cancelling first booking releases inventory immediately
    const cancelRes = await request(app)
      .patch(`/api/stays/bookings/${book1.body.data._id}/cancel`)
      .set("Authorization", `Bearer ${token1}`);
    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.data.status).toBe("CANCELLED");

    // Now guest2 can book the freed room
    const bookAfterCancel = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${token2}`)
      .send({
        propertyId: "prop-darjeeling-hotel",
        roomTypeId: "room-darj-family",
        checkInDate: "2027-04-11",
        checkOutDate: "2027-04-13",
        guests: 2,
        roomsBooked: 1,
      });
    expect(bookAfterCancel.status).toBe(201);
  });

  it("blocks unverified stay reviews and permits reviews only after COMPLETED stay + owner response & moderation", async () => {
    const { token: guestToken } = await registerAndLogin("reviewer@test.com", "Reviewer");
    const { token: outsiderToken } = await registerAndLogin("outsider@test.com", "Outsider");
    const adminToken = await createAdmin();

    // Outsider with no booking is rejected (403)
    const outsiderRev = await request(app)
      .post("/api/stays/prop-darjeeling-hotel/reviews")
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({
        overallRating: 5,
        cleanlinessScore: 5,
        locationScore: 5,
        serviceScore: 5,
        comment: "Trying to submit a fake review without staying here.",
      });
    expect(outsiderRev.status).toBe(403);

    // Book stay (status CONFIRMED, not yet COMPLETED)
    const booking = await request(app)
      .post("/api/stays/bookings")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        propertyId: "prop-darjeeling-hotel",
        roomTypeId: "room-darj-single",
        checkInDate: "2027-06-01",
        checkOutDate: "2027-06-03",
        guests: 1,
        roomsBooked: 1,
      });
    expect(booking.status).toBe(201);

    // Reviewing before stay is COMPLETED is still rejected (403)
    const preComplete = await request(app)
      .post("/api/stays/prop-darjeeling-hotel/reviews")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        overallRating: 5,
        cleanlinessScore: 5,
        locationScore: 5,
        serviceScore: 5,
        comment: "Haven't checked out yet but reviewing early.",
      });
    expect(preComplete.status).toBe(403);

    // Mark stay COMPLETED
    const comp = await request(app)
      .patch(`/api/stays/bookings/${booking.body.data._id}/complete`)
      .set("Authorization", `Bearer ${guestToken}`);
    expect(comp.status).toBe(200);

    // Now verified review succeeds (201)
    const rev = await request(app)
      .post("/api/stays/prop-darjeeling-hotel/reviews")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        overallRating: 5,
        cleanlinessScore: 5,
        locationScore: 4,
        serviceScore: 5,
        comment: "Wonderful sunrise view of Kanchenjunga and spotless rooms.",
      });
    expect(rev.status).toBe(201);
    expect(rev.body.data.verifiedStay).toBe(true);

    // Duplicate review for same booking blocked (409)
    const dup = await request(app)
      .post("/api/stays/prop-darjeeling-hotel/reviews")
      .set("Authorization", `Bearer ${guestToken}`)
      .send({
        overallRating: 4,
        cleanlinessScore: 4,
        locationScore: 4,
        serviceScore: 4,
        comment: "Duplicate review attempt for same booking.",
      });
    expect(dup.status).toBe(409);

    // Owner/admin response & moderation
    const respond = await request(app)
      .patch(`/api/stays/reviews/${rev.body.data._id}/respond`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ message: "Thank you for visiting Kanchenjunga Crest!" });
    expect(respond.status).toBe(200);
    expect(respond.body.data.ownerResponse.message).toContain("Thank you");

    const moderate = await request(app)
      .patch(`/api/stays/reviews/${rev.body.data._id}/moderate`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ moderationStatus: "HIDDEN" });
    expect(moderate.status).toBe(200);
    expect(moderate.body.data.moderationStatus).toBe("HIDDEN");
  });

  it("prevents activity overbooking (Module 22), supports verified tour guide reviews (Module 23) & enforces restaurant capacity (Module 24)", async () => {
    const { token } = await registerAndLogin("explorer@test.com", "Explorer");

    // Module 22: act-manali-paragliding has maxCapacityPerSlot = 6
    const act1 = await request(app)
      .post("/api/experiences/activities/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        activityId: "act-manali-paragliding",
        date: "2027-05-15",
        timeSlot: "09:00",
        participants: 4,
      });
    expect(act1.status).toBe(201);
    expect(act1.body.data.totalAmount).toBe(3200 * 4);

    // Next 3 participants exceed capacity of 6 -> 409 Conflict
    const actOver = await request(app)
      .post("/api/experiences/activities/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        activityId: "act-manali-paragliding",
        date: "2027-05-15",
        timeSlot: "09:00",
        participants: 3,
      });
    expect(actOver.status).toBe(409);

    // Module 23: Local Tour Guide booking & verified review
    const guideBook = await request(app)
      .post("/api/experiences/guides/book")
      .set("Authorization", `Bearer ${token}`)
      .send({
        guideId: "guide-karma-darj",
        startDate: "2027-05-20",
        days: 3,
        languageRequested: "English",
      });
    expect(guideBook.status).toBe(201);
    expect(guideBook.body.data.totalAmount).toBe(2800 * 3);

    const earlyReview = await request(app)
      .post("/api/experiences/guides/guide-karma-darj/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 5, comment: "Premature guide review should fail." });
    expect(earlyReview.status).toBe(403);

    await request(app)
      .patch(`/api/experiences/guides/bookings/${guideBook.body.data._id}/status`)
      .set("Authorization", `Bearer ${token}`)
      .send({ status: "COMPLETED" });

    const validGuideRev = await request(app)
      .post("/api/experiences/guides/guide-karma-darj/reviews")
      .set("Authorization", `Bearer ${token}`)
      .send({ rating: 5, comment: "Karma knew every hidden monastery trail!" });
    expect(validGuideRev.status).toBe(201);

    // Module 24: Restaurant table reservation against configured slot capacity (16 seats at 13:00)
    const rest1 = await request(app)
      .post("/api/experiences/restaurants/reserve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        restaurantId: "rest-gangtok-taste",
        date: "2027-05-21",
        timeSlot: "13:00",
        guests: 12,
      });
    expect(rest1.status).toBe(201);

    const restOverflow = await request(app)
      .post("/api/experiences/restaurants/reserve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        restaurantId: "rest-gangtok-taste",
        date: "2027-05-21",
        timeSlot: "13:00",
        guests: 6,
      });
    expect(restOverflow.status).toBe(409);

    const restInvalidSlot = await request(app)
      .post("/api/experiences/restaurants/reserve")
      .set("Authorization", `Bearer ${token}`)
      .send({
        restaurantId: "rest-gangtok-taste",
        date: "2027-05-21",
        timeSlot: "23:45",
        guests: 2,
      });
    expect(restInvalidSlot.status).toBe(400);
  });
});

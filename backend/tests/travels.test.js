import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";

async function createAdminAndToken() {
  const res = await request(app).post("/api/auth/claim-admin").send({
    username: "Admin",
    email: "admin@test.com",
    password: "AdminPassword123",
  });
  return res.body.token;
}

async function createUserAndToken() {
  await request(app).post("/api/signup").send({
    username: "User",
    email: "user@test.com",
    password: "UserPassword123",
  });
  const res = await request(app).post("/api/login").send({
    email: "user@test.com",
    password: "UserPassword123",
  });
  return res.body.token;
}

describe("Destinations Pagination, Filtering, Sorting & Admin CRUD", () => {
  beforeEach(() => {
    store.resetMemoryStore();
  });

  it("returns paginated destinations with full metadata and 82 seeded destinations", async () => {
    const res = await request(app).get("/api/travels?page=1&limit=12");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(12);
    expect(res.body.pagination.totalItems).toBe(82);
    expect(res.body.pagination.currentPage).toBe(1);
    expect(res.body.pagination.totalPages).toBe(Math.ceil(82 / 12));
    expect(res.body.pagination.hasNextPage).toBe(true);
    expect(res.body.pagination.hasPreviousPage).toBe(false);
  });

  it("validates and clamps pagination query params safely", async () => {
    const badPage = await request(app).get("/api/travels?page=abc");
    expect(badPage.status).toBe(400);

    const negLimit = await request(app).get("/api/travels?limit=-5");
    expect(negLimit.status).toBe(400);

    const clampedLimit = await request(app).get("/api/travels?limit=999");
    expect(clampedLimit.status).toBe(200);
    expect(clampedLimit.body.pagination.limit).toBe(50);
  });

  it("supports search, country, category, price range, rating, and sorting", async () => {
    const searchRes = await request(app).get("/api/travels?search=Jaipur");
    expect(searchRes.status).toBe(200);
    expect(searchRes.body.data.some((d) => d.city === "Jaipur")).toBe(true);

    const indiaRes = await request(app).get("/api/travels?country=India&limit=50");
    expect(indiaRes.status).toBe(200);
    expect(indiaRes.body.data.length).toBeGreaterThanOrEqual(40);
    expect(indiaRes.body.data.every((d) => d.country === "India")).toBe(true);

    const sortedRes = await request(app).get(
      "/api/travels?sortBy=pricePerNight&sortOrder=asc&limit=10",
    );
    expect(sortedRes.status).toBe(200);
    const prices = sortedRes.body.data.map((d) => d.pricePerNight);
    for (let i = 1; i < prices.length; i += 1) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
    }

    const rangeRes = await request(app).get(
      "/api/travels?minPrice=100&maxPrice=250&minRating=4.6",
    );
    expect(rangeRes.status).toBe(200);
    expect(
      rangeRes.body.data.every(
        (d) => d.pricePerNight >= 100 && d.pricePerNight <= 250 && d.rating >= 4.6,
      ),
    ).toBe(true);
  });

  it("returns 404 for nonexistent destination and 400 for invalid ID", async () => {
    const missing = await request(app).get("/api/travels/dest-does-not-exist");
    expect(missing.status).toBe(404);

    const invalid = await request(app).get("/api/travels/bad$$id!!");
    expect(invalid.status).toBe(400);
  });

  it("enforces admin-only destination CRUD and safely archives when bookings exist", async () => {
    const userToken = await createUserAndToken();
    const adminToken = await createAdminAndToken();

    const payload = {
      title: "Ziro Valley Retreat",
      city: "Ziro",
      state: "Arunachal Pradesh",
      country: "India",
      category: "Nature",
      pricePerNight: 110,
      rating: 4.7,
      bestTimeToVisit: "Mar - Oct",
      description: "Lush pine hills and terraced rice fields in Northeast India.",
      image: { url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470" },
      coordinates: { latitude: 27.5449, longitude: 93.8197 },
      highlights: ["Pine Hills", "Apatani Culture"],
      amenities: ["Homestays", "Guided Treks"],
    };

    const userCreate = await request(app)
      .post("/api/travels")
      .set("Authorization", `Bearer ${userToken}`)
      .send(payload);
    expect(userCreate.status).toBe(403);

    const adminCreate = await request(app)
      .post("/api/travels")
      .set("Authorization", `Bearer ${adminToken}`)
      .send(payload);
    expect(adminCreate.status).toBe(201);
    const createdId = adminCreate.body.data._id;

    // Create a booking against this destination
    const futureDate = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const bookingRes = await request(app)
      .post("/api/bookings")
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        travelId: createdId,
        travelers: 2,
        duration: 3,
        date: futureDate,
      });
    expect(bookingRes.status).toBe(201);

    // Deleting a destination with existing bookings must archive instead of hard-deleting
    const delRes = await request(app)
      .delete(`/api/travels/${createdId}`)
      .set("Authorization", `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
    expect(delRes.body.action).toBe("archived");
  });

  it("enforces strict 3-state accessibility filtering (unknown never matches yes) and reporting", async () => {
    const yesRes = await request(app).get("/api/travels?wheelchairAccessible=yes&limit=50");
    expect(yesRes.status).toBe(200);
    expect(yesRes.body.data.length).toBeGreaterThan(0);
    expect(
      yesRes.body.data.every((d) => d.accessibility?.wheelchairAccessible === "yes"),
    ).toBe(true);

    const unknownRes = await request(app).get("/api/travels?wheelchairAccessible=unknown&limit=50");
    expect(unknownRes.status).toBe(200);
    expect(
      unknownRes.body.data.every((d) => d.accessibility?.wheelchairAccessible === "unknown"),
    ).toBe(true);

    const targetId = unknownRes.body.data[0]?._id || yesRes.body.data[0]._id;
    const unauthReport = await request(app)
      .post(`/api/travels/${targetId}/accessibility`)
      .send({ wheelchairAccessible: "yes" });
    expect(unauthReport.status).toBe(401);

    const userToken = await createUserAndToken();
    const reportRes = await request(app)
      .post(`/api/travels/${targetId}/accessibility`)
      .set("Authorization", `Bearer ${userToken}`)
      .send({
        wheelchairAccessible: "no",
        walkingIntensity: "high",
        notes: "Steep mountain steps at main viewpoint",
      });
    expect(reportRes.status).toBe(200);
    expect(reportRes.body.data.accessibility.wheelchairAccessible).toBe("no");
    expect(reportRes.body.data.accessibility.walkingIntensity).toBe("high");
  });
});


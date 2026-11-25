import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import v2Store from "../services/v2StoreService.js";
import geminiService from "../services/geminiService.js";

async function registerAndLogin(email, username) {
  await request(app).post("/api/signup").send({
    username,
    email,
    password: "Password123!",
  });
  const login = await request(app).post("/api/login").send({
    email,
    password: "Password123!",
  });
  return { token: login.body.token, user: login.body.user };
}

describe("Travelogia 2.0 Features 5–11: Readiness, Hidden Gems, Compare, Recommendations, Journal, Packing, Price Watch", () => {
  beforeEach(() => {
    store.resetMemoryStore();
    v2Store.resetV2MemoryStore();
  });

  afterEach(() => {
    geminiService.setGeminiClientForTesting(null);
  });

  it("Feature 5: returns transparent Travel Readiness score with graceful fallback weather", async () => {
    const travels = await request(app).get("/api/travels?limit=3");
    const id = travels.body.data[0]._id;

    const res = await request(app).get(`/api/readiness/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.readinessScore).toBeGreaterThanOrEqual(25);
    expect(res.body.data.readinessScore).toBeLessThanOrEqual(98);
    expect(res.body.data.advisories.emergencyNumber).toBeTruthy();
    expect(res.body.data.weather.verificationLevel).toBe("fallback");
  });

  it("Feature 6: discovers curated Hidden Gems in Northeast India & North Bengal with distance estimates", async () => {
    const res = await request(app).get(
      "/api/hidden-gems?region=Northeast&startCity=Guwahati",
    );
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    expect(res.body.data.every((g) => g.isHiddenGem === true)).toBe(true);
    expect(res.body.data[0].straightLineDistanceKm).toBeTypeOf("number");
  });

  it("Feature 7: compares up to 3 destinations side-by-side and returns grounded Gemini comparison summary", async () => {
    const travels = await request(app).get("/api/travels?limit=4");
    const ids = travels.body.data.slice(0, 3).map((d) => d._id);

    const compRes = await request(app).post("/api/compare").send({
      destinationIds: ids,
      startCity: "Kolkata",
    });
    expect(compRes.status).toBe(200);
    expect(compRes.body.data.destinations).toHaveLength(3);
    expect(compRes.body.data.advantages.mostBudgetFriendlyId).toBeTruthy();

    geminiService.setGeminiClientForTesting({
      models: {
        async generateContent() {
          return { text: "Grounded side-by-side summary highlighting budget and accessibility." };
        },
      },
    });
    const aiRes = await request(app).post("/api/compare/ai-summary").send({
      destinationIds: ids,
      startCity: "Kolkata",
      preferences: "low budget",
    });
    expect(aiRes.status).toBe(200);
    expect(aiRes.body.data.summary).toContain("Grounded side-by-side summary");
  });

  it("Feature 8: produces transparent rule-based weighted recommendations, updates preferences, and resets", async () => {
    const user = await registerAndLogin("rec@test.com", "RecUser");
    const prefRes = await request(app)
      .put("/api/recommendations/preferences")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        preferredCategories: ["Mountain"],
        maxBudgetPerNight: 120,
        preferredSeason: "Autumn",
      });
    expect(prefRes.status).toBe(200);
    expect(prefRes.body.data.algorithmType).toBe("rule-based-weighted-scoring");
    expect(prefRes.body.data.recommendations[0].reasons.length).toBeGreaterThan(0);

    const resetRes = await request(app)
      .post("/api/recommendations/reset")
      .set("Authorization", `Bearer ${user.token}`);
    expect(resetRes.status).toBe(200);
    expect(resetRes.body.preferences.preferredCategories).toEqual([]);
  });

  it("Feature 9: enforces private vs public journal authorization and rejects invalid upload MIME types", async () => {
    const author = await registerAndLogin("author@test.com", "Author");
    const other = await registerAndLogin("other@test.com", "Other");

    const createPriv = await request(app)
      .post("/api/journals")
      .set("Authorization", `Bearer ${author.token}`)
      .field("title", "Secret Valley Diary")
      .field("location", "Ziro, Arunachal Pradesh")
      .field("story", "Quiet pine trails and misty morning views across the rice terraces.")
      .field("isPublic", "false");
    expect(createPriv.status).toBe(201);
    const privId = createPriv.body.data._id;

    // Private journal must not appear in public feed or be readable by another user
    const pubFeed = await request(app).get("/api/journals/public");
    expect(pubFeed.body.data.some((j) => j._id === privId)).toBe(false);

    const forbiddenRead = await request(app)
      .get(`/api/journals/${privId}`)
      .set("Authorization", `Bearer ${other.token}`);
    expect(forbiddenRead.status).toBe(403);

    // Reject non-image file upload (security MIME validation)
    const badUpload = await request(app)
      .post("/api/journals")
      .set("Authorization", `Bearer ${author.token}`)
      .field("title", "Malicious File Test")
      .field("location", "Nowhere")
      .field("story", "Attempting to upload non-image text payload.")
      .attach("photos", Buffer.from("not-an-image"), {
        filename: "exploit.txt",
        contentType: "text/plain",
      });
    expect(badUpload.status).toBe(400);
  });

  it("Feature 10: generates 7-category smart packing list and saves reusable template", async () => {
    const user = await registerAndLogin("pack@test.com", "Packer");
    const genRes = await request(app).post("/api/packing/generate").send({
      destinationName: "Tawang",
      duration: 5,
      season: "Winter",
      travellerType: "backpacker",
      activities: ["trekking", "photography"],
    });
    expect(genRes.status).toBe(200);
    expect(genRes.body.data.items.length).toBeGreaterThan(15);
    expect(genRes.body.data.disclaimer).toContain("not constitute medical advice");

    const saveRes = await request(app)
      .post("/api/packing")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ ...genRes.body.data, isTemplate: true });
    expect(saveRes.status).toBe(201);
    expect(saveRes.body.data.isTemplate).toBe(true);
  });

  it("Feature 11: tracks estimated price history, triggers target-budget alert, and persists unread notification", async () => {
    const user = await registerAndLogin("watcher@test.com", "Watcher");
    const travels = await request(app).get("/api/travels?limit=3");
    const targetDest = travels.body.data[0];

    const histRes = await request(app).get(`/api/price-watch/history/${targetDest._id}`);
    expect(histRes.status).toBe(200);
    expect(histRes.body.data.isEstimate).toBe(true);
    expect(histRes.body.data.observations.length).toBeGreaterThanOrEqual(6);

    // Set alert well below current price so it doesn't trigger immediately
    const lowTarget = Math.max(15, Math.floor(targetDest.pricePerNight * 0.5));
    const alertRes = await request(app)
      .post("/api/price-watch/alerts")
      .set("Authorization", `Bearer ${user.token}`)
      .send({ travelId: targetDest._id, targetPricePerNight: lowTarget });
    expect(alertRes.status).toBe(201);

    // Record new price observation at or below target -> triggers persistent notification
    const obsRes = await request(app)
      .post("/api/price-watch/observations")
      .set("Authorization", `Bearer ${user.token}`)
      .send({
        travelId: targetDest._id,
        estimatedPricePerNight: lowTarget,
        note: "Off-season discount estimate",
      });
    expect(obsRes.status).toBe(201);
    expect(obsRes.body.data.triggeredAlerts.length).toBe(1);

    const notifRes = await request(app)
      .get("/api/price-watch/notifications")
      .set("Authorization", `Bearer ${user.token}`);
    expect(notifRes.status).toBe(200);
    expect(notifRes.body.unreadCount).toBeGreaterThanOrEqual(1);

    const markRes = await request(app)
      .patch(`/api/price-watch/notifications/${notifRes.body.data[0]._id}/read`)
      .set("Authorization", `Bearer ${user.token}`);
    expect(markRes.status).toBe(200);
    expect(markRes.body.data.read).toBe(true);
  });
});

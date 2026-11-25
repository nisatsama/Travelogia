import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import v2Store from "../services/v2StoreService.js";
import geminiService from "../services/geminiService.js";

async function registerAndLogin(email = "planner@test.com", username = "Planner") {
  await request(app).post("/api/signup").send({
    username,
    email,
    password: "Password123!",
  });
  const login = await request(app).post("/api/login").send({
    email,
    password: "Password123!",
  });
  return login.body.token;
}

describe("Travelogia 2.0 Features 1 & 2: AI Smart Trip Builder & Budget Optimizer", () => {
  beforeEach(() => {
    store.resetMemoryStore();
    v2Store.resetV2MemoryStore();
  });

  afterEach(() => {
    geminiService.setGeminiClientForTesting(null);
  });

  it("generates structured itinerary grounded against DB IDs, calculates budget server-side, and regenerates a single day", async () => {
    const token = await registerAndLogin();
    const listRes = await request(app).get("/api/travels?limit=5");
    const validId = listRes.body.data[0]._id;

    let callCount = 0;
    geminiService.setGeminiClientForTesting({
      models: {
        async generateContent() {
          callCount += 1;
          if (callCount === 1) {
            return {
              text: JSON.stringify({
                title: "Himalayan Tea & Peaks Escape",
                dayPlans: [
                  {
                    dayNumber: 1,
                    title: "Arrival & Scenic Ridge",
                    destinationId: validId,
                    destinationTitle: "Valid Catalogue Stop",
                    activities: ["Evening Mall Walk"],
                    attractions: ["Sunset Viewpoint"],
                    accommodationArea: "Central Heritage Ridge",
                    foodRecommendations: ["Local Momos"],
                  },
                  {
                    dayNumber: 2,
                    title: "Hallucinated ID Check Day",
                    destinationId: "fake-hallucinated-id-999",
                    destinationTitle: "Custom Stop",
                    activities: ["Tea Tasting"],
                    attractions: ["Tea Estate"],
                  },
                ],
              }),
            };
          }
          return {
            text: JSON.stringify({
              dayNumber: 2,
              title: "Refreshed Monastery & Valley Day",
              destinationId: validId,
              destinationTitle: "Refreshed Stop",
              activities: ["Morning Monastery Visit", "Local Market"],
              attractions: ["Peace Pagoda"],
            }),
          };
        },
      },
    });

    const genRes = await request(app)
      .post("/api/itineraries/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        startingCity: "Kolkata",
        destinationPreferences: ["Darjeeling"],
        days: 2,
        travelers: 2,
        totalBudget: 1200,
        currency: "USD",
        travelStyle: "balanced",
      });

    expect(genRes.status).toBe(201);
    expect(genRes.body.data.dayPlans).toHaveLength(2);
    // Valid ID preserved; invalid hallucinated ID cleared to ""
    expect(genRes.body.data.dayPlans[0].destinationId).toBe(validId);
    expect(genRes.body.data.dayPlans[1].destinationId).toBe("");
    // Authoritative server-calculated budget present
    expect(genRes.body.data.budgetSummary.estimatedGroupTotal).toBeGreaterThan(0);

    const itineraryId = genRes.body.data._id;

    // Single-day regeneration
    const regenRes = await request(app)
      .post(`/api/itineraries/${itineraryId}/regenerate-day`)
      .set("Authorization", `Bearer ${token}`)
      .send({ dayNumber: 2, focusNote: "More cultural temples" });

    expect(regenRes.status).toBe(200);
    expect(regenRes.body.data.dayPlans[1].title).toBe("Refreshed Monastery & Valley Day");

    // Ownership isolation check
    const otherToken = await registerAndLogin("intruder@test.com", "Intruder");
    const forbidden = await request(app)
      .get(`/api/itineraries/${itineraryId}`)
      .set("Authorization", `Bearer ${otherToken}`);
    expect(forbidden.status).toBe(403);
  });

  it("propagates Gemini upstream errors honestly without fake itineraries", async () => {
    const token = await registerAndLogin();
    geminiService.setGeminiClientForTesting({
      models: {
        async generateContent() {
          const err = new Error("Rate limit");
          err.status = 429;
          throw err;
        },
      },
    });

    const res = await request(app)
      .post("/api/itineraries/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({ startingCity: "Delhi", days: 3, travelers: 2, totalBudget: 900 });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
  });

  it("calculates 7-category budgets, detects over-budget plans with exact revised targets, and persists actual spend", async () => {
    const token = await registerAndLogin();
    const listRes = await request(app).get("/api/travels?limit=3");
    const destIds = listRes.body.data.map((d) => d._id);

    const calcRes = await request(app).post("/api/budgets/calculate").send({
      totalBudget: 250,
      currency: "USD",
      travelers: 3,
      duration: 5,
      destinationIds: destIds,
      accommodationPreference: "luxury",
      transportPreference: "domestic-flight",
    });

    expect(calcRes.status).toBe(200);
    expect(calcRes.body.data.categories).toHaveLength(7);
    expect(calcRes.body.data.overBudget).toBe(true);
    expect(calcRes.body.data.revisedPlan).toBeTruthy();
    expect(calcRes.body.data.revisedPlan.revisedGroupTotal).toBe(250);
    expect(calcRes.body.data.cheaperAlternatives.length).toBeGreaterThan(0);

    // Save revised target budget and record actual spend
    const saveRes = await request(app)
      .post("/api/budgets")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Sikkim Tight Budget",
        totalBudget: 250,
        currency: "USD",
        travelers: 3,
        duration: 5,
        destinationIds: destIds,
        accommodationPreference: "luxury",
        useRevisedPlan: true,
      });

    expect(saveRes.status).toBe(201);
    expect(saveRes.body.data.estimatedGroupTotal).toBe(250);

    const updatedCats = saveRes.body.data.categories.map((c, idx) => ({
      ...c,
      actual: idx === 0 ? 45 : 0,
    }));
    const putRes = await request(app)
      .put(`/api/budgets/${saveRes.body.data._id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ categories: updatedCats });

    expect(putRes.status).toBe(200);
    expect(putRes.body.data.actualGroupTotal).toBe(45);
  });
});

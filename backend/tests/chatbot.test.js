import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import { setGeminiClientForTesting } from "../services/geminiService.js";

describe("Travelogia AI Gemini Chatbot API", () => {
  beforeEach(() => {
    store.resetMemoryStore();
    setGeminiClientForTesting(null);
  });

  afterEach(() => {
    setGeminiClientForTesting(null);
  });

  it("rejects empty or invalid chatbot payloads with 400", async () => {
    const emptyRes = await request(app).post("/api/chatbot/message").send({
      message: "   ",
    });
    expect(emptyRes.status).toBe(400);

    const badHistory = await request(app).post("/api/chatbot/message").send({
      message: "Suggest beaches in India",
      conversationHistory: "not-an-array",
    });
    expect(badHistory.status).toBe(400);
  });

  it("grounds Gemini prompt with matched Travelogia database destinations and returns suggestions", async () => {
    let capturedArgs = null;
    setGeminiClientForTesting({
      models: {
        generateContent: async (args) => {
          capturedArgs = args;
          return {
            text: "For beaches in India, consider Goa or Gokarna from Travelogia's catalogue (estimated nightly rates vary by season).",
          };
        },
      },
    });

    const res = await request(app).post("/api/chatbot/message").send({
      message: "Suggest beach destinations in Goa or Kerala",
      conversationHistory: [],
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.reply).toContain("Goa");
    expect(Array.isArray(res.body.suggestedDestinations)).toBe(true);
    expect(res.body.suggestedDestinations.length).toBeGreaterThan(0);

    // Verify Travelogia DB catalogue context was injected into Gemini systemInstruction
    expect(capturedArgs).toBeTruthy();
    expect(capturedArgs.config.systemInstruction).toContain("TRAVELOGIA DATABASE DESTINATIONS");
    expect(capturedArgs.config.systemInstruction).toContain("Goa");
  });

  it("propagates Gemini upstream errors safely without leaking secrets or fabricating fake replies", async () => {
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          const err = new Error("Upstream failure with key AIzaSySECRET_DO_NOT_LEAK");
          err.status = 500;
          throw err;
        },
      },
    });

    const res = await request(app).post("/api/chatbot/message").send({
      message: "Plan a 5-day Japan trip",
    });

    expect(res.status).toBe(502);
    expect(res.body.success).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain("AIzaSySECRET_DO_NOT_LEAK");
    expect(res.body.reply).toBeUndefined();
  });

  it("propagates upstream 429 rate-limit responses cleanly", async () => {
    setGeminiClientForTesting({
      models: {
        generateContent: async () => {
          const err = new Error("Quota exceeded");
          err.status = 429;
          throw err;
        },
      },
    });

    const res = await request(app).post("/api/chatbot/message").send({
      message: "Best winter hill stations",
    });

    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
  });
});

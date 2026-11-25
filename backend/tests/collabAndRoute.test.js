import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";
import v2Store from "../services/v2StoreService.js";

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

describe("Travelogia 2.0 Features 3 & 4: Collaborative Trip Workspace & Route Optimizer", () => {
  beforeEach(() => {
    store.resetMemoryStore();
    v2Store.resetV2MemoryStore();
  });

  it("enforces private trip membership, invite-code join, viewer RBAC restrictions, voting, comments, and expense splits", async () => {
    const owner = await registerAndLogin("owner@test.com", "AliceOwner");
    const friend = await registerAndLogin("friend@test.com", "BobFriend");
    const stranger = await registerAndLogin("stranger@test.com", "EveStranger");

    const createRes = await request(app)
      .post("/api/trips")
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Northeast Roadtrip", currency: "USD" });

    expect(createRes.status).toBe(201);
    const tripId = createRes.body.data._id;
    const inviteCode = createRes.body.data.inviteCode;
    expect(inviteCode).toHaveLength(8);

    // Non-member cannot read private trip
    const strangerGet = await request(app)
      .get(`/api/trips/${tripId}`)
      .set("Authorization", `Bearer ${stranger.token}`);
    expect(strangerGet.status).toBe(403);

    // Friend joins via invite code
    const joinRes = await request(app)
      .post("/api/trips/join")
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ inviteCode });
    expect(joinRes.status).toBe(200);
    expect(joinRes.body.data.members).toHaveLength(2);

    // Owner adds destination & expense; friend votes & comments
    const travelsRes = await request(app).get("/api/travels?limit=3");
    const destId = travelsRes.body.data[0]._id;
    const destId2 = travelsRes.body.data[1]._id;

    const addDest = await request(app)
      .post(`/api/trips/${tripId}/destinations`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ travelId: destId });
    expect(addDest.status).toBe(201);
    expect(addDest.body.data.destinations).toHaveLength(1);

    const voteRes = await request(app)
      .post(`/api/trips/${tripId}/destinations/${destId}/vote`)
      .set("Authorization", `Bearer ${friend.token}`);
    expect(voteRes.status).toBe(200);
    expect(voteRes.body.data.destinations[0].votes).toHaveLength(2);

    const expRes = await request(app)
      .post(`/api/trips/${tripId}/expenses`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ title: "Shared SUV Rental", amount: 200 });
    expect(expRes.status).toBe(201);
    expect(expRes.body.data.expenseSummary.totalSpent).toBe(200);
    expect(expRes.body.data.expenseSummary.perPersonEqualShare).toBe(100);

    // Owner downgrades friend to viewer -> viewer cannot add destinations, but can still comment
    const roleRes = await request(app)
      .patch(`/api/trips/${tripId}/members/${friend.user.id}`)
      .set("Authorization", `Bearer ${owner.token}`)
      .send({ role: "viewer" });
    expect(roleRes.status).toBe(200);

    const viewerBlocked = await request(app)
      .post(`/api/trips/${tripId}/destinations`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ travelId: destId2 });
    expect(viewerBlocked.status).toBe(403);

    const viewerComment = await request(app)
      .post(`/api/trips/${tripId}/comments`)
      .set("Authorization", `Bearer ${friend.token}`)
      .send({ text: "Looks great, let's leave at 6 AM!" });
    expect(viewerComment.status).toBe(201);
    expect(viewerComment.body.data.comments).toHaveLength(1);
  });

  it("optimizes multi-destination stop sequence with 2-opt TSP and separates straight-line vs road estimates", async () => {
    const travelsRes = await request(app).get("/api/travels?country=India&limit=50");
    const india = travelsRes.body.data;
    const picked = india.slice(0, 4).map((d) => d._id);

    const optRes = await request(app).post("/api/routes/optimize").send({
      startCity: "Kolkata",
      destinationIds: picked,
      returnToStart: true,
      optimize: true,
      travelers: 2,
    });

    expect(optRes.status).toBe(200);
    expect(optRes.body.data.orderedStops).toHaveLength(4);
    expect(optRes.body.data.legs).toHaveLength(5); // start -> 4 stops -> return
    expect(optRes.body.data.summary.totalStraightLineKm).toBeGreaterThan(0);
    expect(optRes.body.data.summary.totalEstimatedRoadKm).toBeGreaterThanOrEqual(
      optRes.body.data.summary.totalStraightLineKm,
    );
    expect(optRes.body.data.legs[0].osmDirectionsUrl).toContain("openstreetmap.org");
    expect(optRes.body.data.legs[0].googleMapsUrl).toContain("google.com/maps");
  });
});

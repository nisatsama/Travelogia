import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app.js";
import store from "../services/storeService.js";

async function signupAndLogin(email) {
  await request(app).post("/api/signup").send({
    username: "FavUser",
    email,
    password: "Password123",
  });
  const res = await request(app).post("/api/login").send({
    email,
    password: "Password123",
  });
  return res.body.token;
}

describe("Favorites / Wishlist API", () => {
  beforeEach(() => {
    store.resetMemoryStore();
  });

  it("requires authentication to access favorites", async () => {
    const res = await request(app).get("/api/favorites");
    expect(res.status).toBe(401);
  });

  it("adds, lists, rejects duplicates, and removes favorites scoped to authenticated user", async () => {
    const token = await signupAndLogin("fav1@example.com");
    const otherToken = await signupAndLogin("fav2@example.com");

    const list = await request(app).get("/api/travels?limit=1");
    const destId = list.body.data[0]._id;

    const add = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ travelId: destId });
    expect(add.status).toBe(201);

    // Duplicate favorite should return 409
    const dup = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ travelId: destId });
    expect(dup.status).toBe(409);

    // Nonexistent destination should return 404
    const missing = await request(app)
      .post("/api/favorites")
      .set("Authorization", `Bearer ${token}`)
      .send({ travelId: "dest-missing-xyz" });
    expect(missing.status).toBe(404);

    // User 1 sees 1 favorite; User 2 sees 0 favorites
    const myFavs = await request(app)
      .get("/api/favorites")
      .set("Authorization", `Bearer ${token}`);
    expect(myFavs.status).toBe(200);
    expect(myFavs.body.data.length).toBe(1);

    const otherFavs = await request(app)
      .get("/api/favorites")
      .set("Authorization", `Bearer ${otherToken}`);
    expect(otherFavs.status).toBe(200);
    expect(otherFavs.body.data.length).toBe(0);

    // Remove favorite
    const del = await request(app)
      .delete(`/api/favorites/${destId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(del.status).toBe(200);

    const afterDel = await request(app)
      .get("/api/favorites")
      .set("Authorization", `Bearer ${token}`);
    expect(afterDel.body.data.length).toBe(0);
  });
});

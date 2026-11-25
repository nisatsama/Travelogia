import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import app from "../app.js";
import env from "../config/env.js";
import store from "../services/storeService.js";

describe("Auth & RBAC Security API", () => {
  beforeEach(() => {
    store.resetMemoryStore();
  });

  it("registers a standard user via signup and NEVER allows role escalation", async () => {
    const res = await request(app).post("/api/signup").send({
      username: "Alice Explorer",
      email: "alice@example.com",
      password: "Password123",
      role: "admin", // Attempted privilege escalation
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.user.role).toBe("user");
    expect(res.body.user.password).toBeUndefined();

    // Verify stored user cannot log in as admin
    const adminLogin = await request(app).post("/api/login").send({
      email: "alice@example.com",
      password: "Password123",
      role: "admin",
    });
    expect(adminLogin.status).toBe(403);
  });

  it("rejects duplicate signup email, invalid email, and weak passwords", async () => {
    const badEmail = await request(app).post("/api/signup").send({
      username: "Bad Email",
      email: "not-an-email",
      password: "Password123",
    });
    expect(badEmail.status).toBe(400);

    const weakPw = await request(app).post("/api/signup").send({
      username: "Weak Pw",
      email: "weak@example.com",
      password: "short",
    });
    expect(weakPw.status).toBe(400);

    await request(app).post("/api/signup").send({
      username: "First User",
      email: "dup@example.com",
      password: "Password123",
    });

    const dup = await request(app).post("/api/signup").send({
      username: "Second User",
      email: "DUP@example.com",
      password: "Password123",
    });
    expect(dup.status).toBe(409);
  });

  it("logs in valid user, sets HttpOnly cookie, and rejects invalid credentials", async () => {
    await request(app).post("/api/signup").send({
      username: "Bob",
      email: "bob@example.com",
      password: "Password123",
    });

    const bad = await request(app).post("/api/login").send({
      email: "bob@example.com",
      password: "WrongPassword1",
    });
    expect(bad.status).toBe(401);

    const good = await request(app).post("/api/login").send({
      email: "bob@example.com",
      password: "Password123",
    });
    expect(good.status).toBe(200);
    expect(good.body.success).toBe(true);
    expect(good.body.token).toBeTruthy();
    expect(good.body.user.role).toBe("user");

    const cookies = good.headers["set-cookie"] || [];
    expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
  });

  it("rejects missing, malformed, and expired JWT tokens on protected routes", async () => {
    const missing = await request(app).get("/api/profile");
    expect(missing.status).toBe(401);

    const malformed = await request(app)
      .get("/api/profile")
      .set("Authorization", "Bearer not.a.valid.jwt");
    expect(malformed.status).toBe(401);

    const expiredToken = jwt.sign(
      { id: "user-123", role: "user" },
      env.JWT_SECRET,
      { expiresIn: -10 },
    );
    const expired = await request(app)
      .get("/api/profile")
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(expired.status).toBe(401);
  });

  it("blocks regular users from admin routes and prevents role escalation via PUT /api/profile", async () => {
    await request(app).post("/api/signup").send({
      username: "Traveler",
      email: "traveler@example.com",
      password: "Password123",
    });
    const login = await request(app).post("/api/login").send({
      email: "traveler@example.com",
      password: "Password123",
    });
    const token = login.body.token;

    const adminAttempt = await request(app)
      .get("/api/admin/overview")
      .set("Authorization", `Bearer ${token}`);
    expect(adminAttempt.status).toBe(403);

    const profileEdit = await request(app)
      .put("/api/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({
        username: "Updated Traveler",
        bio: "Mountain lover",
        role: "admin", // Must be ignored
      });
    expect(profileEdit.status).toBe(200);
    expect(profileEdit.body.user.username).toBe("Updated Traveler");
    expect(profileEdit.body.user.role).toBe("user");
  });

  it("allows one-time initial admin bootstrap and blocks subsequent bootstrap attempts", async () => {
    const first = await request(app).post("/api/auth/claim-admin").send({
      username: "Root Admin",
      email: "admin@travelogia.app",
      password: "AdminPassword123",
    });
    expect(first.status).toBe(201);
    expect(first.body.user.role).toBe("admin");

    const second = await request(app).post("/api/auth/claim-admin").send({
      username: "Second Admin",
      email: "attacker@travelogia.app",
      password: "AdminPassword123",
    });
    expect(second.status).toBe(403);
  });
});

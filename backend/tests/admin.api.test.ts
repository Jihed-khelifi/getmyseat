import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// Relax rate limits, set known admin creds, and isolate file-backed state
// before any module reads config.
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "10000";
process.env.RATE_SUSTAINED_POINTS = "10000";
process.env.RATE_ADMIN_LOGIN_POINTS = "10000";
process.env.ADMIN_EMAIL = "admin@test.local";
process.env.ADMIN_PASSWORD = "secret-pw";

const dataDir = mkdtempSync(join(tmpdir(), "getmyseat-admin-"));
process.env.GETMYSEAT_STATE_FILE = join(dataDir, "state.json");
process.env.GETMYSEAT_EVENT_FILE = join(dataDir, "event.json");

const { createApp } = await import("../src/app.js");
const { buildContainer } = await import("../src/container.js");

let container: ReturnType<typeof buildContainer>;
let app: Express;

async function loginToken(): Promise<string> {
  const res = await request(app)
    .post("/admin/login")
    .send({ email: "admin@test.local", password: "secret-pw" });
  expect(res.status).toBe(200);
  return res.body.token as string;
}

beforeEach(() => {
  container = buildContainer();
  app = createApp(container);
});

afterEach(async () => {
  await container.shutdown();
});

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

describe("admin auth", () => {
  it("issues a bearer token for correct credentials", async () => {
    const res = await request(app)
      .post("/admin/login")
      .send({ email: "admin@test.local", password: "secret-pw" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.expiresAt).toBeTruthy();
  });

  it("returns 401 for wrong credentials", async () => {
    const res = await request(app)
      .post("/admin/login")
      .send({ email: "admin@test.local", password: "nope" });
    expect(res.status).toBe(401);
  });

  it("blocks protected routes without a token", async () => {
    const res = await request(app).get("/admin/overview");
    expect(res.status).toBe(401);
  });

  it("blocks protected routes with an invalid token", async () => {
    const res = await request(app)
      .get("/admin/overview")
      .set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });

  it("allows protected routes with a valid token", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/admin/overview")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.seats).toBeTruthy();
    expect(res.body.cache).toBeTruthy();
    expect(typeof res.body.traffic.requests).toBe("number");
  });
});

describe("admin overview + metrics + logs", () => {
  it("reports seat counts and cache stats", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/admin/overview")
      .set("Authorization", `Bearer ${token}`);
    const seatTotal = Object.values(
      res.body.seats as Record<string, number>,
    ).reduce((a, b) => a + b, 0);
    expect(seatTotal).toBe(container.venueService.listSeats().length);
  });

  it("returns a time-bucketed metrics series", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/admin/metrics")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bucketSeries)).toBe(true);
    expect(res.body.bucketSeries.length).toBeGreaterThan(0);
    expect(res.body.summary.requests).toBeGreaterThan(0);
  });

  it("returns recent request logs", async () => {
    const token = await loginToken();
    const res = await request(app)
      .get("/admin/logs")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.requests)).toBe(true);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.requests.length).toBeGreaterThan(0);
  });
});

describe("event management", () => {
  it("exposes a public GET /event", async () => {
    const res = await request(app).get("/event");
    expect(res.status).toBe(200);
    expect(typeof res.body.name).toBe("string");
    expect(Array.isArray(res.body.updates)).toBe(true);
  });

  it("updates the event via PUT /admin/event and reflects it publicly", async () => {
    const token = await loginToken();
    const put = await request(app)
      .put("/admin/event")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Spring Gala",
        date: "2026-07-01",
        description: "An evening event.",
        arenaLocation: "North Arena",
        updates: ["Doors open at 7pm"],
      });
    expect(put.status).toBe(200);
    expect(put.body.name).toBe("Spring Gala");
    expect(put.body.updatedAt).toBeTruthy();

    const pub = await request(app).get("/event");
    expect(pub.body.name).toBe("Spring Gala");
    expect(pub.body.arenaLocation).toBe("North Arena");
    expect(pub.body.updates).toEqual(["Doors open at 7pm"]);
  });

  it("rejects unauthenticated event updates", async () => {
    const res = await request(app).put("/admin/event").send({
      name: "Hack",
      date: "",
      description: "",
      arenaLocation: "",
      updates: [],
    });
    expect(res.status).toBe(401);
  });
});

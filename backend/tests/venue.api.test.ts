import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Relax rate limits before any module reads config (module-level limiter singleton).
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "10000";
process.env.RATE_SUSTAINED_POINTS = "10000";

const { createApp } = await import("../src/app.js");
const { buildContainer } = await import("../src/container.js");

let container: ReturnType<typeof buildContainer>;
let app: Express;

beforeEach(() => {
  container = buildContainer();
  app = createApp(container);
});

afterEach(async () => {
  await container.shutdown();
});

describe("GET /venue", () => {
  it("returns the server-owned venue contract", async () => {
    const res = await request(app).get("/venue");
    expect(res.status).toBe(200);
    expect(res.body.venueId).toBe(container.venueService.getDocument().venueId);
    expect(Array.isArray(res.body.priceTiers)).toBe(true);
    expect(res.body.priceTiers.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.sections)).toBe(true);
    expect(res.body.map.width).toBeGreaterThan(0);
  });
});

describe("GET /seats/status", () => {
  it("returns a status snapshot keyed by seat id, one per venue seat", async () => {
    const res = await request(app).get("/seats/status");
    expect(res.status).toBe(200);

    const snapshot = res.body as Record<string, string>;
    const seatIds = Object.keys(snapshot);
    expect(seatIds.length).toBe(container.venueService.listSeats().length);

    const valid = new Set(["available", "reserved", "sold", "held"]);
    for (const status of Object.values(snapshot)) {
      expect(valid.has(status)).toBe(true);
    }
  });

  it("seeds status from the venue document", async () => {
    const seat = container.venueService.listSeats()[0]!;
    const res = await request(app).get("/seats/status");
    expect(res.body[seat.id]).toBe(seat.status);
  });
});

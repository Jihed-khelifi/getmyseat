import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Relax rate limits and shorten repo latency before any module reads config.
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "10000";
process.env.RATE_SUSTAINED_POINTS = "10000";
process.env.REPO_READ_DELAY_MS = "20";

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
  vi.restoreAllMocks();
});

describe("GET /users/:id", () => {
  it("serves a seeded user and reports a cache MISS then HIT", async () => {
    const first = await request(app).get("/users/1");
    expect(first.status).toBe(200);
    expect(first.body).toEqual({
      id: "1",
      name: "Ada Lovelace",
      email: "ada@example.com",
    });
    expect(first.headers["x-cache"]).toBe("MISS");

    const second = await request(app).get("/users/1");
    expect(second.status).toBe(200);
    expect(second.headers["x-cache"]).toBe("HIT");
  });

  it("returns 404 for an unknown user", async () => {
    const res = await request(app).get("/users/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("does-not-exist");
  });

  it("deduplicates concurrent cache-miss fetches into one repository read", async () => {
    const spy = vi.spyOn(container.repo, "findById");

    const [a, b] = await Promise.all([
      request(app).get("/users/2"),
      request(app).get("/users/2"),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("POST /users", () => {
  it("queues a write (202) that eventually becomes retrievable", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "Margaret Hamilton", email: "margaret@example.com" });

    expect(res.status).toBe(202);
    expect(res.body.status).toBe("queued");
    expect(typeof res.body.id).toBe("string");

    await container.queue.onIdle();

    const fetched = await request(app).get(`/users/${res.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.name).toBe("Margaret Hamilton");
    // Cache was primed on creation, so the first read is a hit.
    expect(fetched.headers["x-cache"]).toBe("HIT");
  });

  it("rejects an invalid body with 400", async () => {
    const res = await request(app)
      .post("/users")
      .send({ name: "", email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Validation failed");
  });
});

describe("cache admin endpoints", () => {
  it("exposes observable metrics via GET /cache-status", async () => {
    await request(app).get("/users/1");
    await request(app).get("/users/1");

    const res = await request(app).get("/cache-status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      hits: expect.any(Number),
      misses: expect.any(Number),
      hitRate: expect.any(Number),
      size: expect.any(Number),
      averageResponseTimeMs: expect.any(Number),
      inFlight: expect.any(Number),
    });
    expect(res.body.queue).toMatchObject({
      size: expect.any(Number),
      pending: expect.any(Number),
    });
  });

  it("clears entries on DELETE /cache while preserving counters", async () => {
    await request(app).get("/users/1");
    const cleared = await request(app).delete("/cache");

    expect(cleared.status).toBe(200);
    expect(cleared.body.status).toBe("cleared");
    expect(cleared.body.size).toBe(0);
    expect(cleared.body.clears).toBe(1);
    // A prior miss was recorded and survives the clear.
    expect(cleared.body.misses).toBeGreaterThan(0);
  });
});

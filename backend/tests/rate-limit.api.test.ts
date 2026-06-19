import type { Express } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Tight burst window so the limit is easy to trigger deterministically.
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "3";
process.env.RATE_BURST_DURATION = "10";
process.env.RATE_SUSTAINED_POINTS = "100";
process.env.RATE_SUSTAINED_DURATION = "60";
process.env.REPO_READ_DELAY_MS = "5";

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

describe("rate limiting", () => {
  it("allows requests up to the burst limit then responds 429", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).get("/health");
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it("includes retry metadata on a 429 response", async () => {
    let limited;
    for (let i = 0; i < 5; i += 1) {
      limited = await request(app).get("/health");
    }

    expect(limited?.status).toBe(429);
    expect(limited?.body.error).toBe("Too many requests");
    expect(limited?.body.retryAfterMs).toBeGreaterThan(0);
    expect(limited?.headers["retry-after"]).toBeDefined();
  });
});

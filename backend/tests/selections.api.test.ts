import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Express } from "express";
import request from "supertest";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

// Relax rate limits and isolate the file-backed state before any module loads.
process.env.LOG_LEVEL = "silent";
process.env.RATE_BURST_POINTS = "10000";
process.env.RATE_SUSTAINED_POINTS = "10000";

const dataDir = mkdtempSync(join(tmpdir(), "getmyseat-sel-"));
process.env.GETMYSEAT_STATE_FILE = join(dataDir, "state.json");

const { createApp } = await import("../src/app.js");
const { buildContainer } = await import("../src/container.js");

let container: ReturnType<typeof buildContainer>;
let app: Express;

/** First N seat ids that are currently selectable (status === "available"). */
function availableSeatIds(n: number): string[] {
  const snapshot = container.seatStatus.getSnapshot();
  return Object.entries(snapshot)
    .filter(([, status]) => status === "available")
    .slice(0, n)
    .map(([seatId]) => seatId);
}

function venueId(): string {
  return container.venueService.getDocument().venueId;
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

describe("selections API", () => {
  it("mints a visitor id when none is provided", async () => {
    const res = await request(app).get("/selections/me");
    expect(res.status).toBe(200);
    expect(res.headers["x-visitor-id"]).toBeTruthy();
    expect(res.body).toMatchObject({ seatIds: [], updatedAt: null });
  });

  it("round-trips a saved selection for the same visitor", async () => {
    const seatIds = availableSeatIds(2);
    const visitor = "visitor-round-trip";

    const put = await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", visitor)
      .send({ venueId: venueId(), seatIds });
    expect(put.status).toBe(200);
    expect(put.body.seatIds).toEqual(seatIds);
    expect(put.body.visitorId).toBe(visitor);
    expect(put.body.updatedAt).toBeTruthy();

    const get = await request(app)
      .get("/selections/me")
      .set("X-Visitor-Id", visitor);
    expect(get.status).toBe(200);
    expect(get.body.seatIds).toEqual(seatIds);
  });

  it("isolates selections per visitor id", async () => {
    const seatIds = availableSeatIds(1);
    await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", "visitor-a")
      .send({ venueId: venueId(), seatIds });

    const other = await request(app)
      .get("/selections/me")
      .set("X-Visitor-Id", "visitor-b");
    expect(other.body.seatIds).toEqual([]);
    expect(other.body.updatedAt).toBeNull();
  });

  it("clears a selection on DELETE", async () => {
    const visitor = "visitor-delete";
    await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", visitor)
      .send({ venueId: venueId(), seatIds: availableSeatIds(1) });

    const del = await request(app)
      .delete("/selections/me")
      .set("X-Visitor-Id", visitor);
    expect(del.status).toBe(204);

    const get = await request(app)
      .get("/selections/me")
      .set("X-Visitor-Id", visitor);
    expect(get.body.updatedAt).toBeNull();
  });

  it("rejects unknown seat ids", async () => {
    const res = await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", "visitor-bad-seat")
      .send({ venueId: venueId(), seatIds: ["does-not-exist"] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Selection rejected");
  });

  it("rejects a mismatched venue id", async () => {
    const res = await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", "visitor-bad-venue")
      .send({ venueId: "other-venue", seatIds: availableSeatIds(1) });
    expect(res.status).toBe(400);
  });

  it("rejects more than the 8-seat cap", async () => {
    const res = await request(app)
      .put("/selections/me")
      .set("X-Visitor-Id", "visitor-too-many")
      .send({ venueId: venueId(), seatIds: availableSeatIds(9) });
    expect(res.status).toBe(400);
    expect(res.body.details.issues.join(" ")).toMatch(/max 8/i);
  });
});

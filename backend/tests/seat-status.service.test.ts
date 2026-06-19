import { describe, expect, it } from "vitest";

import { SeatStatusService } from "../src/services/seat-status.service.js";
import type { SeatStatus } from "../src/types/venue.js";

const seed: Array<[string, SeatStatus]> = [
  ["s1", "available"],
  ["s2", "sold"],
  ["s3", "available"],
];

describe("SeatStatusService", () => {
  it("seeds statuses and reports size", () => {
    const store = new SeatStatusService(seed);
    expect(store.size).toBe(3);
    expect(store.getStatus("s1")).toBe("available");
    expect(store.getStatus("s2")).toBe("sold");
  });

  it("returns a snapshot copy keyed by seat id", () => {
    const store = new SeatStatusService(seed);
    const snap = store.getSnapshot();
    expect(snap).toEqual({ s1: "available", s2: "sold", s3: "available" });

    // Mutating the snapshot must not affect the store.
    snap.s1 = "held";
    expect(store.getStatus("s1")).toBe("available");
  });

  it("updates a known seat and reports the change", () => {
    const store = new SeatStatusService(seed);
    expect(store.setStatus("s1", "held")).toBe(true);
    expect(store.getStatus("s1")).toBe("held");
  });

  it("is a no-op for an unknown seat or unchanged status", () => {
    const store = new SeatStatusService(seed);
    expect(store.setStatus("nope", "held")).toBe(false);
    expect(store.has("nope")).toBe(false);
    expect(store.setStatus("s2", "sold")).toBe(false);
  });
});

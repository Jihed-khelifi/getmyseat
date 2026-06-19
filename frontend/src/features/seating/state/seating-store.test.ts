import { beforeEach, describe, expect, it } from "vitest";
import { loadVenue } from "../model/seat-validation";
import { MAX_SELECTION, type RawSeat } from "../model/seat-types";
import { canSelectSeat, computeSummary } from "./seating-store";

function makeVenue() {
  const seats: RawSeat[] = Array.from({ length: 10 }, (_, i) => ({
    id: `seat-${i + 1}`,
    label: String(i + 1),
    x: i * 20,
    y: 0,
    status: "available",
    priceTierId: "t1",
  }));
  seats.push({
    id: "seat-sold",
    label: "X",
    x: 220,
    y: 0,
    status: "sold",
    priceTierId: "t1",
  });

  return loadVenue({
    venueId: "test-venue",
    name: "Test",
    currency: "USD",
    map: { width: 400, height: 200 },
    priceTiers: [{ id: "t1", label: "Standard", priceCents: 5000 }],
    sections: [
      {
        id: "s1",
        label: "S1",
        rows: [{ id: "r1", label: "A", seats }],
      },
    ],
  });
}

describe("selection guard", () => {
  let venue: ReturnType<typeof makeVenue>;
  beforeEach(() => {
    venue = makeVenue();
  });

  it("rejects non-available seats", () => {
    const verdict = canSelectSeat(venue, new Map(), new Set(), "seat-sold");
    expect(verdict).toEqual({ ok: false, reason: "not-selectable" });
  });

  it("enforces the 8-seat cap", () => {
    const full = new Set(
      Array.from({ length: MAX_SELECTION }, (_, i) => `seat-${i + 1}`),
    );
    expect(canSelectSeat(venue, new Map(), full, "seat-9")).toEqual({
      ok: false,
      reason: "limit-reached",
    });
  });

  it("always allows deselecting an already-selected seat", () => {
    const full = new Set(
      Array.from({ length: MAX_SELECTION }, (_, i) => `seat-${i + 1}`),
    );
    expect(canSelectSeat(venue, new Map(), full, "seat-1")).toEqual({
      ok: true,
    });
  });

  it("computes subtotal across the selection", () => {
    const summary = computeSummary(
      venue,
      new Set(["seat-1", "seat-2", "seat-3"]),
    );
    expect(summary.count).toBe(3);
    expect(summary.subtotalCents).toBe(15000);
    expect(summary.byTier[0]?.tier.id).toBe("t1");
  });
});

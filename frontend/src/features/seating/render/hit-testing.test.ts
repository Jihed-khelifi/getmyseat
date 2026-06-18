import { describe, expect, it } from "vitest";
import { loadVenue } from "../model/seat-validation";
import type { RawSeat } from "../model/seat-types";
import { buildSeatIndex, seatIdsOf } from "./hit-testing";

/** A 3×3 grid of seats spaced 20 world-units apart, plus one sold seat. */
function makeGridVenue() {
  const seats: RawSeat[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      seats.push({
        id: `r${row}c${col}`,
        label: `${col + 1}`,
        x: col * 20,
        y: row * 20,
        status: "available",
        priceTierId: "t1",
      });
    }
  }
  return loadVenue({
    venueId: "grid",
    name: "Grid",
    currency: "USD",
    map: { width: 100, height: 100 },
    priceTiers: [{ id: "t1", label: "Std", priceCents: 1000 }],
    sections: [
      { id: "s1", label: "S1", rows: [{ id: "r1", label: "A", seats }] },
    ],
  });
}

describe("hit-testing", () => {
  const venue = makeGridVenue();
  const index = buildSeatIndex(venue);

  it("returns the seat under a point within the radius", () => {
    const seat = index.hitTest(1, 1, 5);
    expect(seat?.id).toBe("r0c0");
  });

  it("returns nothing when the nearest seat is outside the radius", () => {
    // Midway between four seats (10,10) is ~14 units from each.
    expect(index.hitTest(10, 10, 5)).toBeUndefined();
  });

  it("snaps to the closest seat among neighbors", () => {
    const seat = index.hitTest(19, 1, 6);
    expect(seat?.id).toBe("r0c1");
  });

  it("collects every seat inside a world rectangle", () => {
    const ids = seatIdsOf(index.withinRect(-1, -1, 21, 21)).sort();
    expect(ids).toEqual(["r0c0", "r0c1", "r1c0", "r1c1"]);
  });

  it("nearest() always returns a seat regardless of distance", () => {
    expect(index.nearest(1000, 1000)?.id).toBe("r2c2");
  });
});

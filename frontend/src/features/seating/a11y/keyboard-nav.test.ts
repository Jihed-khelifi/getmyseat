import { describe, expect, it } from "vitest";
import { loadVenue } from "../model/seat-validation";
import type { RawSeat } from "../model/seat-types";
import {
  directionFromKey,
  initialFocusSeat,
  isActivationKey,
  nextSeat,
} from "./keyboard-nav";

/** Two rows (A on top, B below) with 3 and 2 seats respectively. */
function makeVenue() {
  const rowA: RawSeat[] = [0, 1, 2].map((c) => ({
    id: `a${c}`,
    label: `${c + 1}`,
    x: c * 20,
    y: 0,
    status: "available",
    priceTierId: "t1",
  }));
  const rowB: RawSeat[] = [0, 1].map((c) => ({
    id: `b${c}`,
    label: `${c + 1}`,
    x: c * 20,
    y: 20,
    status: "available",
    priceTierId: "t1",
  }));
  return loadVenue({
    venueId: "kbd",
    name: "Kbd",
    currency: "USD",
    map: { width: 100, height: 100 },
    priceTiers: [{ id: "t1", label: "Std", priceCents: 1000 }],
    sections: [
      {
        id: "s1",
        label: "S1",
        rows: [
          { id: "rA", label: "A", seats: rowA },
          { id: "rB", label: "B", seats: rowB },
        ],
      },
    ],
  });
}

const venue = makeVenue();
const seat = (id: string) => venue.seatsById.get(id)!;

describe("keyboard navigation", () => {
  it("focuses the top-left seat first", () => {
    expect(initialFocusSeat(venue)?.id).toBe("a0");
  });

  it("moves within a row by column index", () => {
    expect(nextSeat(venue, seat("a0"), "right")?.id).toBe("a1");
    expect(nextSeat(venue, seat("a1"), "left")?.id).toBe("a0");
  });

  it("stops at row edges instead of wrapping", () => {
    expect(nextSeat(venue, seat("a0"), "left")).toBeUndefined();
    expect(nextSeat(venue, seat("a2"), "right")).toBeUndefined();
  });

  it("moves between rows preserving column where possible", () => {
    expect(nextSeat(venue, seat("a1"), "down")?.id).toBe("b1");
    expect(nextSeat(venue, seat("b1"), "up")?.id).toBe("a1");
  });

  it("clamps the column when the target row is narrower", () => {
    // Row A column 2 has no counterpart in the 2-seat row B → clamp to last.
    expect(nextSeat(venue, seat("a2"), "down")?.id).toBe("b1");
  });

  it("stops at the top and bottom edges", () => {
    expect(nextSeat(venue, seat("a0"), "up")).toBeUndefined();
    expect(nextSeat(venue, seat("b0"), "down")).toBeUndefined();
  });

  it("maps arrow keys to directions and ignores others", () => {
    expect(directionFromKey("ArrowRight")).toBe("right");
    expect(directionFromKey("ArrowUp")).toBe("up");
    expect(directionFromKey("a")).toBeUndefined();
  });

  it("recognizes activation keys", () => {
    expect(isActivationKey("Enter")).toBe(true);
    expect(isActivationKey(" ")).toBe(true);
    expect(isActivationKey("Tab")).toBe(false);
  });
});

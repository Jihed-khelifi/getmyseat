import { describe, expect, it } from "vitest";
import { loadVenue } from "../model/seat-validation";
import type { RawSeat, RawVenue, SeatStatus } from "../model/seat-types";
import { findAdjacentSeats } from "./adjacency";

function seat(id: string, x: number, status: SeatStatus): RawSeat {
  return { id, label: id, x, y: 0, status, priceTierId: "t1" };
}

/** Two rows; row A has a 3-run gap, row B is fully open. */
function makeVenue(): ReturnType<typeof loadVenue> {
  const rowA: RawSeat[] = [
    seat("a1", 0, "available"),
    seat("a2", 20, "sold"),
    seat("a3", 40, "available"),
    seat("a4", 60, "available"),
    seat("a5", 80, "available"),
  ];
  const rowB: RawSeat[] = [
    seat("b1", 0, "available"),
    seat("b2", 20, "available"),
    seat("b3", 40, "available"),
  ];
  const venue: RawVenue = {
    venueId: "v",
    name: "V",
    currency: "USD",
    map: { width: 200, height: 100 },
    priceTiers: [{ id: "t1", label: "T", priceCents: 1000 }],
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
  };
  return loadVenue(venue);
}

describe("findAdjacentSeats", () => {
  it("finds a contiguous available run within a row", () => {
    const venue = makeVenue();
    const result = findAdjacentSeats(venue, new Map(), 3);
    expect(result).toEqual(["a3", "a4", "a5"]);
  });

  it("skips a row where a sold seat breaks the run", () => {
    const venue = makeVenue();
    // Only 2 contiguous in row A before/around the gap of relevant length; 4
    // contiguous never exist in row A but row B has only 3 — so 4 fails overall.
    expect(findAdjacentSeats(venue, new Map(), 4)).toBeUndefined();
  });

  it("honours live status over the venue seed", () => {
    const venue = makeVenue();
    const live = new Map<string, SeatStatus>([["a4", "held"]]);
    // a3,a4,a5 no longer contiguous-available; no 3-run remains in row A, but
    // row B still has b1,b2,b3.
    expect(findAdjacentSeats(venue, live, 3)).toEqual(["b1", "b2", "b3"]);
  });

  it("returns undefined when no run is long enough", () => {
    const venue = makeVenue();
    const live = new Map<string, SeatStatus>([
      ["b1", "sold"],
      ["a4", "sold"],
    ]);
    expect(findAdjacentSeats(venue, live, 3)).toBeUndefined();
  });
});

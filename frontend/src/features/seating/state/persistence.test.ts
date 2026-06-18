import { beforeEach, describe, expect, it } from "vitest";
import { loadVenue } from "../model/seat-validation";
import type { RawSeat } from "../model/seat-types";
import {
  clearPersistedSelection,
  loadPersistedSelection,
  savePersistedSelection,
  selectionStorageKey,
} from "./persistence";
import { useSeatingStore } from "./seating-store";

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
    venueId: "venue-a",
    name: "Test",
    currency: "USD",
    map: { width: 400, height: 200 },
    priceTiers: [{ id: "t1", label: "Standard", priceCents: 5000 }],
    sections: [
      { id: "s1", label: "S1", rows: [{ id: "r1", label: "A", seats }] },
    ],
  });
}

beforeEach(() => {
  window.localStorage.clear();
  useSeatingStore.setState({
    venue: undefined,
    selectedSeatIds: new Set(),
    focusedSeatId: undefined,
    lastRejection: undefined,
  });
});

describe("selection persistence", () => {
  it("round-trips a saved selection", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1", "seat-2"],
    });
    expect(loadPersistedSelection("venue-a")).toEqual({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1", "seat-2"],
    });
  });

  it("never returns a selection saved under a different venueId", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1"],
    });
    expect(loadPersistedSelection("venue-b")).toBeUndefined();
  });

  it("treats a structurally invalid payload as absent", () => {
    window.localStorage.setItem(
      selectionStorageKey("venue-a"),
      JSON.stringify({ version: 99, venueId: "venue-a", selectedSeatIds: 7 }),
    );
    expect(loadPersistedSelection("venue-a")).toBeUndefined();
  });

  it("clears a persisted selection", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1"],
    });
    clearPersistedSelection("venue-a");
    expect(loadPersistedSelection("venue-a")).toBeUndefined();
  });
});

describe("store rehydration", () => {
  it("restores a valid persisted selection on setVenue", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1", "seat-3"],
    });
    useSeatingStore.getState().setVenue(makeVenue());
    expect([...useSeatingStore.getState().selectedSeatIds]).toEqual([
      "seat-1",
      "seat-3",
    ]);
  });

  it("drops persisted ids that no longer exist or are not selectable", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: ["seat-1", "seat-sold", "ghost-seat"],
    });
    useSeatingStore.getState().setVenue(makeVenue());
    expect([...useSeatingStore.getState().selectedSeatIds]).toEqual(["seat-1"]);
  });

  it("never restores more than the 8-seat cap", () => {
    savePersistedSelection({
      version: 1,
      venueId: "venue-a",
      selectedSeatIds: Array.from({ length: 10 }, (_, i) => `seat-${i + 1}`),
    });
    useSeatingStore.getState().setVenue(makeVenue());
    expect(useSeatingStore.getState().selectedSeatIds.size).toBe(8);
  });

  it("starts empty when persisted data belongs to a different venue", () => {
    savePersistedSelection({
      version: 1,
      venueId: "some-other-venue",
      selectedSeatIds: ["seat-1"],
    });
    useSeatingStore.getState().setVenue(makeVenue());
    expect(useSeatingStore.getState().selectedSeatIds.size).toBe(0);
  });
});

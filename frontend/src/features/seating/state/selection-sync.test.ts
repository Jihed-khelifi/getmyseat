import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadVenue } from "../model/seat-validation";
import type { RawSeat } from "../model/seat-types";
import { useSeatingStore } from "./seating-store";
import { hydrateSelection, startSelectionSync } from "./selection-sync";

function makeVenue() {
  const seats: RawSeat[] = Array.from({ length: 10 }, (_, i) => ({
    id: `seat-${i + 1}`,
    label: String(i + 1),
    x: i * 20,
    y: 0,
    status: "available",
    priceTierId: "t1",
  }));
  return loadVenue({
    venueId: "test-venue",
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
  useSeatingStore.getState().setVenue(makeVenue());
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("startSelectionSync", () => {
  it("PUTs a debounced selection driven by toggleSeat", () => {
    vi.useFakeTimers();
    const saveSelection = vi.fn().mockResolvedValue(undefined);
    const stop = startSelectionSync(useSeatingStore, {
      saveSelection,
      debounceMs: 300,
    });

    // The only mutation path: toggleSeat.
    useSeatingStore.getState().toggleSeat("seat-1");
    useSeatingStore.getState().toggleSeat("seat-2");

    // Debounced: nothing fired yet.
    expect(saveSelection).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);

    expect(saveSelection).toHaveBeenCalledTimes(1);
    expect(saveSelection).toHaveBeenCalledWith("test-venue", [
      "seat-1",
      "seat-2",
    ]);
    stop();
  });

  it("stops syncing after unsubscribe", () => {
    vi.useFakeTimers();
    const saveSelection = vi.fn().mockResolvedValue(undefined);
    const stop = startSelectionSync(useSeatingStore, {
      saveSelection,
      debounceMs: 300,
    });
    stop();

    useSeatingStore.getState().toggleSeat("seat-1");
    vi.advanceTimersByTime(300);
    expect(saveSelection).not.toHaveBeenCalled();
  });
});

describe("hydrateSelection", () => {
  it("restores the server selection when a record exists (server wins)", async () => {
    const getSelection = vi.fn().mockResolvedValue({
      visitorId: "v1",
      venueId: "test-venue",
      seatIds: ["seat-3", "unknown-seat"],
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    await hydrateSelection(useSeatingStore, { getSelection });

    // Stale/unknown ids are dropped during reconciliation.
    expect([...useSeatingStore.getState().selectedSeatIds]).toEqual(["seat-3"]);
  });

  it("pushes a local selection up when the server has no record yet", async () => {
    useSeatingStore.getState().toggleSeat("seat-1");
    const getSelection = vi.fn().mockResolvedValue({
      visitorId: "v1",
      venueId: null,
      seatIds: [],
      updatedAt: null,
    });
    const saveSelection = vi.fn().mockResolvedValue(undefined);

    await hydrateSelection(useSeatingStore, { getSelection, saveSelection });

    expect(saveSelection).toHaveBeenCalledWith("test-venue", ["seat-1"]);
    // Local selection is preserved (not wiped by an empty server record).
    expect([...useSeatingStore.getState().selectedSeatIds]).toEqual(["seat-1"]);
  });

  it("degrades to local state when the server call fails", async () => {
    useSeatingStore.getState().toggleSeat("seat-1");
    const getSelection = vi.fn().mockRejectedValue(new Error("offline"));
    const onError = vi.fn();

    await hydrateSelection(useSeatingStore, { getSelection, onError });

    expect(onError).toHaveBeenCalled();
    expect([...useSeatingStore.getState().selectedSeatIds]).toEqual(["seat-1"]);
  });
});

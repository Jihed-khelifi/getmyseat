import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { loadVenue } from "@/features/seating/model/seat-validation";
import type { RawSeat } from "@/features/seating/model/seat-types";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import { SeatDetailsSheet } from "./SeatDetailsSheet";

function makeVenue() {
  const seats: RawSeat[] = [
    {
      id: "a0",
      label: "1",
      x: 0,
      y: 0,
      status: "available",
      priceTierId: "t1",
    },
    {
      id: "a1",
      label: "2",
      x: 20,
      y: 0,
      status: "available",
      priceTierId: "t1",
    },
    { id: "a2", label: "3", x: 40, y: 0, status: "sold", priceTierId: "t1" },
  ];
  return loadVenue({
    venueId: "ui-venue",
    name: "UI",
    currency: "USD",
    map: { width: 100, height: 50 },
    priceTiers: [{ id: "t1", label: "Standard", priceCents: 5000 }],
    sections: [
      { id: "s1", label: "S1", rows: [{ id: "rA", label: "A", seats }] },
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

describe("SeatDetailsSheet", () => {
  it("shows the focused seat's details", () => {
    useSeatingStore.getState().setFocusedSeat("a0");
    render(<SeatDetailsSheet />);
    expect(screen.getByText(/Row A · Seat 1/)).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("selects and removes the focused seat, updating the subtotal", async () => {
    useSeatingStore.getState().setFocusedSeat("a0");
    render(<SeatDetailsSheet />);

    fireEvent.click(screen.getByRole("button", { name: "Select seat" }));
    expect(useSeatingStore.getState().selectedSeatIds.has("a0")).toBe(true);
    expect(screen.getByText("Selection (1/8)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove seat" }));
    expect(useSeatingStore.getState().selectedSeatIds.has("a0")).toBe(false);
    expect(screen.getByText("Selection (0/8)")).toBeInTheDocument();
  });

  it("disables selection for a sold seat", () => {
    useSeatingStore.getState().setFocusedSeat("a2");
    render(<SeatDetailsSheet />);
    expect(screen.getByRole("button", { name: "Select seat" })).toBeDisabled();
  });

  it("aggregates a subtotal and clears the whole selection", async () => {
    useSeatingStore.getState().toggleSeat("a0");
    useSeatingStore.getState().toggleSeat("a1");
    render(<SeatDetailsSheet />);

    const summary = screen.getByText("Selection (2/8)").closest("section")!;
    const subtotalRow = within(summary).getByText("Subtotal").parentElement!;
    expect(within(subtotalRow).getByText("$100.00")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(useSeatingStore.getState().selectedSeatIds.size).toBe(0);
    expect(screen.getByText("Selection (0/8)")).toBeInTheDocument();
  });
});

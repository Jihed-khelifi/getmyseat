/**
 * Status-change pulse registry (plan 09, Phase 2 animation gate).
 *
 * A tiny module-level store of "seat → when its status last changed" used to
 * drive a brief fading ring in the canvas draw loop. Keeping it outside React
 * (like the rest of the render layer) means a burst of live deltas never creates
 * per-seat React work — the canvas loop reads this map each frame.
 */
import type { SeatId } from "../model/seat-types";
import { PULSE_DURATION_MS } from "./draw-seats";

const pulses = new Map<SeatId, number>();

/** Record that a seat just changed status, starting its pulse animation. */
export function markPulse(seatId: SeatId, at: number = now()): void {
  pulses.set(seatId, at);
}

/** The active pulses map consumed by `drawSeats`. */
export function getPulses(): ReadonlyMap<SeatId, number> {
  return pulses;
}

/** Drop finished pulses; returns true while at least one pulse is still active. */
export function prunePulses(at: number = now()): boolean {
  for (const [seatId, startedAt] of pulses) {
    if (at - startedAt >= PULSE_DURATION_MS) pulses.delete(seatId);
  }
  return pulses.size > 0;
}

/** Clear all pulses (test helper). */
export function clearPulses(): void {
  pulses.clear();
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

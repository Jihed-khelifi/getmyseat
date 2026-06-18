/**
 * Selection persistence — load/save the user's seat selection across reloads.
 *
 * Ownership (plan 02): persisted selection is scoped by `venueId` and validated
 * with Zod on restore. Persisted ids are treated as UNTRUSTED: the store filters
 * them against the freshly loaded venue (existence + selectable status) before
 * applying, so a stale or tampered payload can never select an invalid seat.
 */
import { z } from "zod";
import type { PersistedSelectionState, VenueId } from "../model/seat-types";
import { readJson, removeKey, writeJson } from "../../../lib/storage";

const STORAGE_PREFIX = "getmyseat:selection:";

export function selectionStorageKey(venueId: VenueId): string {
  return `${STORAGE_PREFIX}${venueId}`;
}

const persistedSchema = z.object({
  version: z.literal(1),
  venueId: z.string().min(1),
  selectedSeatIds: z.array(z.string().min(1)),
});

/** Load and validate the persisted selection for a venue, if any. */
export function loadPersistedSelection(
  venueId: VenueId,
): PersistedSelectionState | undefined {
  const raw = readJson<unknown>(selectionStorageKey(venueId));
  if (raw === undefined) return undefined;
  const parsed = persistedSchema.safeParse(raw);
  if (!parsed.success || parsed.data.venueId !== venueId) return undefined;
  return parsed.data as PersistedSelectionState;
}

export function savePersistedSelection(state: PersistedSelectionState): void {
  writeJson(selectionStorageKey(state.venueId), state);
}

export function clearPersistedSelection(venueId: VenueId): void {
  removeKey(selectionStorageKey(venueId));
}

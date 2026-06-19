/**
 * Server-backed selection sync (plan 08, Phase 6).
 *
 * Bridges the Zustand store to the backend without adding a second mutation
 * path: it only **observes** selection changes (driven by `toggleSeat`) and
 * pushes them to the server, debounced so frequent toggles coalesce into one
 * `PUT` (and stay comfortably within the shared rate limiter).
 *
 * Conflict rule (decision gate 1): the server is authoritative on load
 * (`hydrateSelection`); afterwards the local optimistic state is reconciled on
 * the next successful `PUT`. A failed network call never corrupts local state —
 * `localStorage` remains the offline fallback.
 */
import type { SeatingState } from "./seating-store";
import {
  getSelection as defaultGetSelection,
  saveSelection as defaultSaveSelection,
  type SelectionRecord,
} from "../../../lib/api";

/** Minimal store surface this module needs (keeps it unit-testable). */
export interface SelectionStore {
  getState(): SeatingState;
  subscribe(
    listener: (state: SeatingState, prev: SeatingState) => void,
  ): () => void;
}

export interface SelectionSyncDeps {
  getSelection?: () => Promise<SelectionRecord>;
  saveSelection?: (venueId: string, seatIds: string[]) => Promise<unknown>;
  debounceMs?: number;
  /** Non-blocking notice when a sync write fails (optional). */
  onError?: (err: unknown) => void;
}

/**
 * Hydrate the store from the server (server wins when a record exists). When no
 * server record exists yet, the locally restored selection is pushed up so
 * "view later" works on the first visit.
 */
export async function hydrateSelection(
  store: SelectionStore,
  deps: SelectionSyncDeps = {},
): Promise<void> {
  const getSelection = deps.getSelection ?? defaultGetSelection;
  const saveSelection = deps.saveSelection ?? defaultSaveSelection;

  const venue = store.getState().venue;
  if (!venue) return;

  let record: SelectionRecord;
  try {
    record = await getSelection();
  } catch (err) {
    deps.onError?.(err);
    return; // degrade to the localStorage-restored selection
  }

  if (record.updatedAt !== null && record.venueId === venue.venueId) {
    // Server is authoritative: restore its selection (reconciled vs live status).
    store.getState().rehydrateSelection(record.seatIds);
    return;
  }

  // No server record yet: if the browser already had a local selection, push it
  // up so the same browser can retrieve it later.
  const local = [...store.getState().selectedSeatIds];
  if (local.length > 0) {
    try {
      await saveSelection(venue.venueId, local);
    } catch (err) {
      deps.onError?.(err);
    }
  }
}

/**
 * Subscribe to selection changes and push them to the server (debounced).
 * Returns an unsubscribe function. Start this **after** `hydrateSelection` so the
 * initial restore does not echo straight back to the server.
 */
export function startSelectionSync(
  store: SelectionStore,
  deps: SelectionSyncDeps = {},
): () => void {
  const saveSelection = deps.saveSelection ?? defaultSaveSelection;
  const debounceMs = deps.debounceMs ?? 600;

  let timer: ReturnType<typeof setTimeout> | undefined;

  const unsubscribe = store.subscribe((state, prev) => {
    if (state.selectedSeatIds === prev.selectedSeatIds) return;
    const venue = state.venue;
    if (!venue) return;

    const seatIds = [...state.selectedSeatIds];
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void saveSelection(venue.venueId, seatIds).catch((err) => {
        deps.onError?.(err);
      });
    }, debounceMs);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}

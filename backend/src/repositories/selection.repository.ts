/**
 * Selection repository (plan 08, Phase 2 — the "mock DB" for saved selections).
 *
 * Keeps selections in memory keyed by `visitorId` for fast reads, and persists
 * them through {@link JsonFileStore} so "view my selection later" survives a
 * backend restart (gate G2 = file-backed JSON). Persistence is debounced and
 * atomic; the durability mechanics stay hidden behind this repository so the
 * selection service never knows whether storage is memory- or file-backed.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { SelectionRecord, VisitorId } from "../types/selection.js";
import { JsonFileStore } from "./json-file-store.js";

const selectionRecordSchema = z.object({
  visitorId: z.string().min(1),
  venueId: z.string().min(1),
  seatIds: z.array(z.string().min(1)),
  updatedAt: z.string().min(1),
});

/** Top-level persisted shape; versioned to allow safe future migrations. */
const stateFileSchema = z.object({
  version: z.literal(1),
  selections: z.array(selectionRecordSchema),
});

type StateFile = z.infer<typeof stateFileSchema>;

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Default file-backed state path, overridable via env (used by tests). */
function defaultStatePath(): string {
  return (
    process.env.GETMYSEAT_STATE_FILE ??
    resolve(moduleDir, "../../.data/state.json")
  );
}

export class SelectionRepository {
  private readonly records = new Map<VisitorId, SelectionRecord>();
  private readonly store: JsonFileStore<StateFile>;

  /** @param filePath Override the persisted file location (tests). */
  constructor(filePath: string = defaultStatePath()) {
    this.store = new JsonFileStore<StateFile>(filePath, stateFileSchema, () =>
      this.serialize(),
    );
    const seed: StateFile = { version: 1, selections: [] };
    for (const record of this.store.load(seed).selections) {
      this.records.set(record.visitorId, record);
    }
  }

  /** This visitor's saved selection, or `undefined` if none exists. */
  get(visitorId: VisitorId): SelectionRecord | undefined {
    const record = this.records.get(visitorId);
    return record ? { ...record, seatIds: [...record.seatIds] } : undefined;
  }

  /** Number of visitors with a saved selection (admin overview, plan 10). */
  count(): number {
    return this.records.size;
  }

  /** Total seats currently saved across all visitors (admin overview, plan 10). */
  totalSelectedSeats(): number {
    let total = 0;
    for (const record of this.records.values()) total += record.seatIds.length;
    return total;
  }

  /** Persist (replace) a visitor's selection and return the stored record. */
  save(record: SelectionRecord): SelectionRecord {
    const stored: SelectionRecord = { ...record, seatIds: [...record.seatIds] };
    this.records.set(stored.visitorId, stored);
    this.store.scheduleSave();
    return { ...stored, seatIds: [...stored.seatIds] };
  }

  /** Clear a visitor's selection. */
  delete(visitorId: VisitorId): void {
    if (this.records.delete(visitorId)) this.store.scheduleSave();
  }

  /** Force any pending write to disk (shutdown / tests). */
  flush(): void {
    this.store.flush();
  }

  private serialize(): StateFile {
    return { version: 1, selections: [...this.records.values()] };
  }
}

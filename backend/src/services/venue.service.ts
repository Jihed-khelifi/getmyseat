/**
 * Venue service (plan 07, pillar 1 — "seat status becomes backend-owned").
 *
 * Loads and Zod-validates the server-owned venue document (the geometry + price
 * contract) once at boot, and exposes:
 *  - the validated document for `GET /venue`, and
 *  - a flat, ordered seat list used to seed the seat-status store.
 *
 * The venue document is read from disk (not `import`ed) so the same file works
 * under `tsx` (dev/tests, module lives in `src/`) and `node dist` (prod): we try
 * a module-relative path first, then fall back to the source tree.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import type { RawSeat, SeatStatus, VenueDocument } from "../types/venue.js";

const seatStatusSchema = z.enum(["available", "reserved", "sold", "held"]);

const priceTierSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  color: z.string().min(1).optional(),
});

const rawSeatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  x: z.number().finite(),
  y: z.number().finite(),
  status: seatStatusSchema,
  priceTierId: z.string().min(1),
});

const rawRowSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  seats: z.array(rawSeatSchema).min(1),
});

const rawSectionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  rows: z.array(rawRowSchema).min(1),
});

export const venueDocumentSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(1),
  currency: z.string().length(3),
  map: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  priceTiers: z.array(priceTierSchema).min(1),
  sections: z.array(rawSectionSchema).min(1),
});

const moduleDir = dirname(fileURLToPath(import.meta.url));

/** Resolve the venue document, preferring a module-relative path (dev/tests). */
function resolveVenuePath(): string {
  const moduleRelative = resolve(moduleDir, "../data/venue.json");
  const cwdRelative = resolve(process.cwd(), "src/data/venue.json");
  return existsSync(moduleRelative) ? moduleRelative : cwdRelative;
}

/** Validate referential integrity Zod alone cannot (unique ids, known tiers). */
function assertReferentialIntegrity(doc: VenueDocument): void {
  const tierIds = new Set(doc.priceTiers.map((t) => t.id));
  const seenSeatIds = new Set<string>();

  for (const section of doc.sections) {
    for (const row of section.rows) {
      for (const seat of row.seats) {
        if (!tierIds.has(seat.priceTierId)) {
          throw new Error(
            `Seat "${seat.id}" references unknown price tier "${seat.priceTierId}".`,
          );
        }
        if (seenSeatIds.has(seat.id)) {
          throw new Error(`Duplicate seat id "${seat.id}".`);
        }
        seenSeatIds.add(seat.id);
      }
    }
  }
}

/**
 * Parse + validate an unknown venue payload into a typed `VenueDocument`.
 * Exported so tests can validate fixtures without touching the filesystem.
 */
export function parseVenueDocument(input: unknown): VenueDocument {
  const doc = venueDocumentSchema.parse(input) as VenueDocument;
  assertReferentialIntegrity(doc);
  return doc;
}

export class VenueService {
  private readonly document: VenueDocument;
  private readonly seats: readonly RawSeat[];

  /**
   * @param document Optional pre-built document (used by tests). When omitted,
   * the server-owned `venue.json` is read and validated from disk.
   */
  constructor(document?: VenueDocument) {
    this.document = document ?? this.loadFromDisk();
    this.seats = this.document.sections.flatMap((section) =>
      section.rows.flatMap((row) => row.seats),
    );
  }

  private loadFromDisk(): VenueDocument {
    const path = resolveVenuePath();
    const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parseVenueDocument(raw);
  }

  /** The validated venue document (geometry + price tiers) for `GET /venue`. */
  getDocument(): VenueDocument {
    return this.document;
  }

  /** Flat, document-order seat list used to seed the seat-status store. */
  listSeats(): readonly RawSeat[] {
    return this.seats;
  }

  /** Seed pairs `[seatId, status]` for the seat-status store. */
  seedStatuses(): Array<[string, SeatStatus]> {
    return this.seats.map((seat) => [seat.id, seat.status]);
  }
}

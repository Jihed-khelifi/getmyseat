/**
 * Runtime validation and normalization for `public/venue.json`.
 *
 * Ownership (plan 02): this file is the only place that parses untrusted venue
 * data. It exposes Zod schemas plus `normalizeVenue`, which flattens the nested
 * raw shape into the lookup-friendly `NormalizedVenue` used everywhere else.
 */
import { z } from "zod";
import type {
  NormalizedVenue,
  RawVenue,
  Row,
  Seat,
  Section,
  SeatId,
  RowId,
  SectionId,
  PriceTierId,
  PriceTier,
} from "./seat-types";

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

export const rawVenueSchema = z.object({
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

/** Parse unknown JSON into a typed, structurally valid `RawVenue` (throws on failure). */
export function parseVenue(input: unknown): RawVenue {
  return rawVenueSchema.parse(input) as RawVenue;
}

/**
 * Flatten a validated `RawVenue` into a `NormalizedVenue`.
 *
 * Performed once at load. Also enforces referential integrity that Zod alone
 * cannot (e.g. every seat references a known price tier) and establishes the
 * deterministic orderings keyboard navigation relies on:
 *  - seats within a row are ordered by ascending x (left → right),
 *  - rows are ordered by their seats' average y (top → bottom).
 */
export function normalizeVenue(raw: RawVenue): NormalizedVenue {
  const priceTiersById = new Map<PriceTierId, PriceTier>(
    raw.priceTiers.map((tier) => [tier.id, tier]),
  );

  const seatsById = new Map<SeatId, Seat>();
  const sectionsById = new Map<SectionId, Section>();
  const rowsById = new Map<RowId, Row>();
  const seatOrder: Seat[] = [];
  const rowMeta: Array<{ rowId: RowId; avgY: number }> = [];

  for (const rawSection of raw.sections) {
    const section: Section = {
      id: rawSection.id,
      label: rawSection.label,
      rowIds: rawSection.rows.map((r) => r.id),
    };
    sectionsById.set(section.id, section);

    for (const rawRow of rawSection.rows) {
      const orderedSeats = [...rawRow.seats].sort((a, b) => a.x - b.x);
      const seatIds: SeatId[] = [];
      let sumY = 0;

      orderedSeats.forEach((rawSeat, colIndex) => {
        if (!priceTiersById.has(rawSeat.priceTierId)) {
          throw new Error(
            `Seat "${rawSeat.id}" references unknown price tier "${rawSeat.priceTierId}".`,
          );
        }
        if (seatsById.has(rawSeat.id)) {
          throw new Error(`Duplicate seat id "${rawSeat.id}".`);
        }
        const seat: Seat = {
          id: rawSeat.id,
          label: rawSeat.label,
          x: rawSeat.x,
          y: rawSeat.y,
          status: rawSeat.status,
          priceTierId: rawSeat.priceTierId,
          sectionId: rawSection.id,
          rowId: rawRow.id,
          colIndex,
        };
        seatsById.set(seat.id, seat);
        seatOrder.push(seat);
        seatIds.push(seat.id);
        sumY += seat.y;
      });

      rowsById.set(rawRow.id, {
        id: rawRow.id,
        label: rawRow.label,
        sectionId: rawSection.id,
        seatIds,
      });
      rowMeta.push({ rowId: rawRow.id, avgY: sumY / orderedSeats.length });
    }
  }

  const rowOrder = rowMeta.sort((a, b) => a.avgY - b.avgY).map((r) => r.rowId);

  return {
    venueId: raw.venueId,
    name: raw.name,
    currency: raw.currency,
    map: raw.map,
    seatOrder,
    seatsById,
    sectionsById,
    rowsById,
    priceTiersById,
    rowOrder,
  };
}

/** Convenience: validate unknown JSON and normalize in one step. */
export function loadVenue(input: unknown): NormalizedVenue {
  return normalizeVenue(parseVenue(input));
}

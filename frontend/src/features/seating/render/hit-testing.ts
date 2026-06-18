/**
 * Spatial hit-testing: pointer coordinates → seat identity.
 *
 * Decision gate (plan 02): the spatial index is **d3-quadtree**. Seats are
 * points, and `quadtree.find(x, y, radius)` is an exact, allocation-free nearest
 * lookup within a radius — ideal for click/tap hit-testing and a foundation for
 * the optional adjacent-seat finder (plan 03, Phase 6).
 *
 * All input is expected in WORLD coordinates. Callers convert pointer/screen
 * coordinates first via `render/viewport.ts#screenToWorld` so this module never
 * needs to know about the current zoom/pan.
 */
import { quadtree, type Quadtree } from "d3-quadtree";
import type { NormalizedVenue, Seat, SeatId } from "../model/seat-types";

export interface SeatIndex {
  /** Find the seat nearest to a world point within `radius` (world units), if any. */
  hitTest(worldX: number, worldY: number, radius: number): Seat | undefined;
  /** Seats whose centers fall within a world-space rectangle (marquee/adjacency). */
  withinRect(x0: number, y0: number, x1: number, y1: number): Seat[];
  /** The nearest seat regardless of distance (used for keyboard "nearest" fallbacks). */
  nearest(worldX: number, worldY: number): Seat | undefined;
  raw: Quadtree<Seat>;
}

/**
 * Build a quadtree index over all seats. Construct once per venue load and reuse;
 * rebuild only if seat positions change (they do not at runtime).
 */
export function buildSeatIndex(venue: NormalizedVenue): SeatIndex {
  const tree = quadtree<Seat>()
    .x((s) => s.x)
    .y((s) => s.y)
    .addAll(venue.seatOrder);

  return {
    raw: tree,
    hitTest(worldX, worldY, radius) {
      return tree.find(worldX, worldY, radius);
    },
    nearest(worldX, worldY) {
      return tree.find(worldX, worldY);
    },
    withinRect(x0, y0, x1, y1) {
      const minX = Math.min(x0, x1);
      const minY = Math.min(y0, y1);
      const maxX = Math.max(x0, x1);
      const maxY = Math.max(y0, y1);
      const found: Seat[] = [];
      tree.visit((node, nx0, ny0, nx1, ny1) => {
        // Prune quadrants that cannot overlap the query rectangle.
        if (!("length" in node)) {
          let leaf: typeof node | undefined = node;
          do {
            const seat = leaf.data;
            if (
              seat.x >= minX &&
              seat.x <= maxX &&
              seat.y >= minY &&
              seat.y <= maxY
            ) {
              found.push(seat);
            }
            leaf = leaf.next;
          } while (leaf);
        }
        return nx0 > maxX || ny0 > maxY || nx1 < minX || ny1 < minY;
      });
      return found;
    },
  };
}

/** Type guard helper for consumers iterating quadtree results by id. */
export function seatIdsOf(seats: Seat[]): SeatId[] {
  return seats.map((s) => s.id);
}

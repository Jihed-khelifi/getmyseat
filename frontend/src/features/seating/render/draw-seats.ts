/**
 * Canvas seat rendering.
 *
 * Ownership (plan 02): rendering primitives and batching. This module draws the
 * seat population to a 2D canvas **outside React reconciliation** — React never
 * owns one node per seat. The draw path is a pure function of (venue, viewport,
 * selection); callers schedule it via requestAnimationFrame.
 *
 * Decision gate (plan 02): seat labels are NOT drawn below `LABEL_ZOOM_THRESHOLD`
 * to keep large maps legible and fast; above it, labels render per seat.
 */
import type {
  NormalizedVenue,
  Seat,
  SeatId,
  SeatStatus,
  ViewportTransform,
} from "../model/seat-types";
import { worldToScreen } from "./viewport";

/** World-space seat radius before scaling. */
export const SEAT_RADIUS = 9;

/** Only draw seat labels once the scale crosses this threshold. */
export const LABEL_ZOOM_THRESHOLD = 1.6;

/** World-space vertical gap between a section's top seat and its label. */
const SECTION_LABEL_GAP = 22;

export interface DrawOptions {
  venue: NormalizedVenue;
  transform: ViewportTransform;
  /** Set of currently selected seat ids (selection overrides status color). */
  selected: ReadonlySet<SeatId>;
  /**
   * Live seat status (plan 09). The single status source: the server snapshot +
   * WebSocket deltas, falling back to the venue seed. When omitted, `seat.status`
   * is used (keeps older call sites working).
   */
  liveStatus?: ReadonlyMap<SeatId, SeatStatus>;
  /** When true, colour seats by price tier instead of status (plan 09 heat-map). */
  heatmap?: boolean;
  /**
   * Recently-changed seats → change timestamp (ms). Drives a brief status-change
   * pulse (plan 09 animation gate: a cheap fading ring). Requires `now`.
   */
  pulses?: ReadonlyMap<SeatId, number>;
  /** Current animation clock (ms). Paired with `pulses`. */
  now?: number;
  /** Optional focused seat id to render with a focus ring (keyboard a11y). */
  focusedSeatId?: SeatId;
  /** Device pixel ratio for crisp rendering on HiDPI displays. */
  dpr: number;
  /** CSS pixel size of the canvas viewport. */
  width: number;
  height: number;
}

/** How long a status-change pulse animates (ms). */
export const PULSE_DURATION_MS = 600;

/**
 * Status → CSS color resolved from the design tokens in `index.css`. Reading the
 * variables keeps the canvas palette in sync with the legend and dark mode.
 */
function statusColors(): Record<SeatStatus | "selected" | "focusRing", string> {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    available: read("--seat-available", "#22c55e"),
    reserved: read("--seat-reserved", "#f59e0b"),
    sold: read("--seat-sold", "#94a3b8"),
    held: read("--seat-held", "#a855f7"),
    selected: read("--seat-selected", "#3b82f6"),
    focusRing: read("--ring", "#2563eb"),
  };
}

/** Deterministic fallback palette for price tiers without an explicit color. */
const HEATMAP_FALLBACK = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
]; /** Build a `priceTierId → color` map for heat-map mode (plan 09, Phase 3). */
function heatmapColors(venue: NormalizedVenue): Map<string, string> {
  const colors = new Map<string, string>();
  let i = 0;
  for (const tier of venue.priceTiersById.values()) {
    colors.set(
      tier.id,
      tier.color ?? HEATMAP_FALLBACK[i % HEATMAP_FALLBACK.length]!,
    );
    i += 1;
  }
  return colors;
}

/**
 * Draw a label for every section, anchored at the horizontal center of the
 * section's seats and just above its topmost row. Section labels are always
 * visible (unlike per-seat labels) so visitors can orient themselves on the map
 * even when zoomed out.
 */
function drawSectionLabels(
  ctx: CanvasRenderingContext2D,
  venue: NormalizedVenue,
  transform: ViewportTransform,
  width: number,
  height: number,
): void {
  // Aggregate each section's seat bounds (world space) in a single pass.
  const bounds = new Map<
    string,
    { minX: number; maxX: number; minY: number }
  >();
  for (const seat of venue.seatOrder) {
    const b = bounds.get(seat.sectionId);
    if (!b) {
      bounds.set(seat.sectionId, {
        minX: seat.x,
        maxX: seat.x,
        minY: seat.y,
      });
    } else {
      if (seat.x < b.minX) b.minX = seat.x;
      if (seat.x > b.maxX) b.maxX = seat.x;
      if (seat.y < b.minY) b.minY = seat.y;
    }
  }

  const styles = getComputedStyle(document.documentElement);
  const fg = styles.getPropertyValue("--foreground").trim() || "#0b1220";
  const bg = styles.getPropertyValue("--card").trim() || "#ffffff";

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 14px ui-sans-serif, system-ui, sans-serif`;

  for (const [sectionId, b] of bounds) {
    const section = venue.sectionsById.get(sectionId);
    if (!section) continue;
    const world = {
      x: (b.minX + b.maxX) / 2,
      y: b.minY - SECTION_LABEL_GAP,
    };
    const p = worldToScreen(world, transform);
    // Skip labels that fall outside the viewport.
    if (p.x < 0 || p.x > width || p.y < -16 || p.y > height + 16) continue;

    // A subtle backing pill keeps the label legible over dense seats.
    const text = section.label;
    const padX = 6;
    const metrics = ctx.measureText(text);
    const w = metrics.width + padX * 2;
    const h = 20;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(p.x - w / 2, p.y - h / 2, w, h, 6);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = fg;
    ctx.fillText(text, p.x, p.y);
  }

  ctx.restore();
}

/**
 * Draw the full seat population for the current frame. Offscreen seats are culled.
 * This is a correctness-first baseline; sprite/atlas batching (plan 03, Phase 3)
 * can replace the inner loop without changing this signature.
 */
export function drawSeats(
  ctx: CanvasRenderingContext2D,
  opts: DrawOptions,
): void {
  const {
    venue,
    transform,
    selected,
    liveStatus,
    heatmap = false,
    pulses,
    now,
    focusedSeatId,
    dpr,
    width,
    height,
  } = opts;
  const colors = statusColors();
  const tierColors = heatmap ? heatmapColors(venue) : undefined;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const r = Math.max(2, SEAT_RADIUS * transform.scale);
  const showLabels = transform.scale >= LABEL_ZOOM_THRESHOLD;
  const margin = r + 4;

  if (showLabels) {
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `${Math.round(r)}px ui-sans-serif, system-ui, sans-serif`;
  }

  for (const seat of venue.seatOrder) {
    const p = worldToScreen(seat, transform);
    // Cull seats outside the visible viewport.
    if (
      p.x < -margin ||
      p.y < -margin ||
      p.x > width + margin ||
      p.y > height + margin
    ) {
      continue;
    }

    const status = liveStatus?.get(seat.id) ?? seat.status;
    const isSelected = selected.has(seat.id);

    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    if (isSelected) {
      // Selection always wins so the local user's own holds stay distinct from
      // seats held by other visitors (plan 09 visual-distinctness rule).
      ctx.fillStyle = colors.selected;
    } else if (tierColors) {
      ctx.fillStyle = tierColors.get(seat.priceTierId) ?? colors[status];
    } else {
      ctx.fillStyle = colors[status];
    }
    ctx.fill();

    // Brief status-change pulse: an expanding, fading ring around the seat.
    if (pulses && now !== undefined) {
      const startedAt = pulses.get(seat.id);
      if (startedAt !== undefined) {
        const t = (now - startedAt) / PULSE_DURATION_MS;
        if (t >= 0 && t < 1) {
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.lineWidth = 2;
          ctx.strokeStyle =
            colors[status] === colors.available
              ? colors.available
              : colors[status];
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + t * r * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }

    if (seat.id === focusedSeatId) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = colors.focusRing;
      ctx.stroke();
    }

    if (showLabels) {
      ctx.fillStyle = "#0b1220";
      ctx.fillText(seat.label, p.x, p.y);
    }
  }

  drawSectionLabels(ctx, venue, transform, width, height);
}

/** Picking radius (in world units) used by pointer hit-testing for a given scale. */
export function pickRadiusWorld(transform: ViewportTransform): number {
  // Allow a slightly generous touch target; convert screen radius back to world.
  return (SEAT_RADIUS + 6) / transform.scale;
}

/** Helper used by the legend so colors stay defined in one place. */
export function seatStatusLabel(status: SeatStatus): string {
  const map: Record<SeatStatus, string> = {
    available: "Available",
    reserved: "Reserved",
    sold: "Sold",
    held: "On hold",
  };
  return map[status];
}

export type { Seat };

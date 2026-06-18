import { Minus, Plus, Maximize } from "lucide-react";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import {
  clampScale,
  fitToViewport,
  zoomAround,
} from "@/features/seating/render/viewport";
import { cn } from "@/lib/utils";

export const MIN_SCALE = 0.2;
export const MAX_SCALE = 6;

interface SeatToolbarProps {
  /** Current viewport pixel size, needed for centered zoom and reset-to-fit. */
  viewport: { width: number; height: number };
  className?: string;
}

/**
 * Zoom controls and reset-view (plan 02 mobile fallback + plan 03 Phase 5).
 * Buttons mutate the shared viewport transform via the store, reusing the same
 * `viewport.ts` math as pointer/pinch zoom so behavior stays consistent.
 */
export function SeatToolbar({ viewport, className }: SeatToolbarProps) {
  const transform = useSeatingStore((s) => s.transform);
  const setTransform = useSeatingStore((s) => s.setTransform);
  const venue = useSeatingStore((s) => s.venue);

  const center = { x: viewport.width / 2, y: viewport.height / 2 };

  const zoomBy = (factor: number) => {
    const nextScale = clampScale(
      transform.scale * factor,
      MIN_SCALE,
      MAX_SCALE,
    );
    setTransform(zoomAround(transform, center, nextScale));
  };

  const resetView = () => {
    if (!venue) return;
    setTransform(fitToViewport(venue.map, viewport.width, viewport.height));
  };

  const btn =
    "inline-flex size-9 items-center justify-center rounded-md border bg-card text-card-foreground shadow-sm transition-colors hover:bg-accent focus-visible:outline-none";

  return (
    <div
      className={cn("flex gap-1", className)}
      role="group"
      aria-label="Map zoom controls"
    >
      <button
        type="button"
        className={btn}
        onClick={() => zoomBy(1.25)}
        aria-label="Zoom in"
      >
        <Plus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        onClick={() => zoomBy(0.8)}
        aria-label="Zoom out"
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        className={btn}
        onClick={resetView}
        aria-label="Reset view"
      >
        <Maximize className="size-4" aria-hidden />
      </button>
    </div>
  );
}

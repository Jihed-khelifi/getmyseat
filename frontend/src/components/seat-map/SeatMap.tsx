import { useEffect, useMemo, useRef, useState } from "react";
import { useSeatingStore } from "@/features/seating/state/seating-store";
import { buildSeatIndex } from "@/features/seating/render/hit-testing";
import {
  drawSeats,
  pickRadiusWorld,
} from "@/features/seating/render/draw-seats";
import {
  getPulses,
  prunePulses,
} from "@/features/seating/render/pulse-registry";
import {
  clampScale,
  fitToViewport,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAround,
} from "@/features/seating/render/viewport";
import {
  directionFromKey,
  initialFocusSeat,
  isActivationKey,
  nextSeat,
} from "@/features/seating/a11y/keyboard-nav";
import { MAX_SCALE, MIN_SCALE, SeatToolbar } from "./SeatToolbar";
import { cn } from "@/lib/utils";

/**
 * SeatMap — composition of the canvas seat layer with pointer/keyboard wiring.
 *
 * Plan 02 makes this the single place that connects the render, state, and a11y
 * modules: it draws via `draw-seats.ts`, picks via `hit-testing.ts`, transforms
 * via `viewport.ts`, navigates via `keyboard-nav.ts`, and mutates only through
 * the store's `toggleSeat`.
 *
 * Gestures (plan 03, Phase 5) are handled with native Pointer Events rather than
 * react-zoom-pan-pinch: the canvas needs world-space coordinates for hit-testing,
 * so every drag-pan, pinch-zoom, and wheel-zoom feeds the single transform math
 * in `viewport.ts` instead of a competing DOM-transform layer. Tap-vs-drag is
 * disambiguated by a small movement threshold so a pan never selects a seat.
 */
export function SeatMap({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // Active pointers (client coords) + per-gesture metadata for pan/pinch/tap.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef({ startX: 0, startY: 0, moved: false });

  const venue = useSeatingStore((s) => s.venue);
  const transform = useSeatingStore((s) => s.transform);
  const selectedSeatIds = useSeatingStore((s) => s.selectedSeatIds);
  const focusedSeatId = useSeatingStore((s) => s.focusedSeatId);
  const liveStatus = useSeatingStore((s) => s.liveStatus);
  const heatmap = useSeatingStore((s) => s.heatmap);
  const setTransform = useSeatingStore((s) => s.setTransform);
  const setFocusedSeat = useSeatingStore((s) => s.setFocusedSeat);
  const toggleSeat = useSeatingStore((s) => s.toggleSeat);

  const index = useMemo(
    () => (venue ? buildSeatIndex(venue) : undefined),
    [venue],
  );

  // Track container size for canvas sizing and viewport math.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Fit the whole venue into view once it loads and we know the viewport size.
  const didFit = useRef(false);
  useEffect(() => {
    if (!venue || size.width === 0 || size.height === 0 || didFit.current)
      return;
    setTransform(fitToViewport(venue.map, size.width, size.height));
    didFit.current = true;
  }, [venue, size, setTransform]);

  // Draw on any visual state change. A status-change pulse (plan 09) keeps the
  // rAF loop running for a few frames after a delta, then stops — animation
  // stays inside the canvas loop and never becomes per-seat React work.
  const rafRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !venue || size.width === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);

    const renderFrame = () => {
      const now =
        typeof performance !== "undefined" ? performance.now() : Date.now();
      const stillAnimating = prunePulses(now);
      const s = useSeatingStore.getState();
      if (!s.venue) return;
      drawSeats(ctx, {
        venue: s.venue,
        transform: s.transform,
        selected: s.selectedSeatIds,
        liveStatus: s.liveStatus,
        heatmap: s.heatmap,
        pulses: getPulses(),
        now,
        focusedSeatId: s.focusedSeatId,
        dpr,
        width: size.width,
        height: size.height,
      });
      if (stillAnimating) {
        rafRef.current = requestAnimationFrame(renderFrame);
      } else {
        rafRef.current = undefined;
      }
    };

    if (rafRef.current === undefined) {
      rafRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = undefined;
      }
    };
  }, [
    venue,
    transform,
    selectedSeatIds,
    focusedSeatId,
    liveStatus,
    heatmap,
    size,
  ]);

  const pickSeatAt = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !index) return undefined;
    const rect = canvas.getBoundingClientRect();
    const world = screenToWorld(
      { x: clientX - rect.left, y: clientY - rect.top },
      transform,
    );
    return index.hitTest(world.x, world.y, pickRadiusWorld(transform));
  };

  const DRAG_THRESHOLD = 6; // px of movement before a press becomes a pan, not a tap

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      gestureRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    } else {
      // A second finger always means a gesture, never a tap-to-select.
      gestureRef.current.moved = true;
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const pointers = pointersRef.current;
    const prev = pointers.get(e.pointerId);
    if (!canvas || !prev) return;

    // Two-pointer pinch: zoom around the finger midpoint and pan with it.
    if (pointers.size >= 2) {
      const ids = [...pointers.keys()];
      const aId = ids[0];
      const bId = ids[1];
      if (aId === undefined || bId === undefined) return;
      const beforeA = { ...pointers.get(aId)! };
      const beforeB = { ...pointers.get(bId)! };
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const afterA = pointers.get(aId)!;
      const afterB = pointers.get(bId)!;
      const rect = canvas.getBoundingClientRect();
      const mid = (
        p: { x: number; y: number },
        q: { x: number; y: number },
      ) => ({
        x: (p.x + q.x) / 2 - rect.left,
        y: (p.y + q.y) / 2 - rect.top,
      });
      const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
        Math.hypot(p.x - q.x, p.y - q.y);
      const midBefore = mid(beforeA, beforeB);
      const midAfter = mid(afterA, afterB);
      const distBefore = dist(beforeA, beforeB);
      const distAfter = dist(afterA, afterB);

      const t = useSeatingStore.getState().transform;
      const panned = panBy(
        t,
        midAfter.x - midBefore.x,
        midAfter.y - midBefore.y,
      );
      const ratio = distBefore > 0 ? distAfter / distBefore : 1;
      const nextScale = clampScale(t.scale * ratio, MIN_SCALE, MAX_SCALE);
      setTransform(zoomAround(panned, midAfter, nextScale));
      gestureRef.current.moved = true;
      return;
    }

    // Single-pointer drag: pan once movement passes the tap threshold.
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gestureRef.current;
    if (
      !g.moved &&
      Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_THRESHOLD
    ) {
      g.moved = true;
    }
    if (g.moved) {
      setTransform(panBy(useSeatingStore.getState().transform, dx, dy));
    }
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const pointers = pointersRef.current;
    const wasSinglePointer = pointers.size === 1;
    pointers.delete(e.pointerId);
    canvas?.releasePointerCapture?.(e.pointerId);

    // A clean single-pointer press with no drag is a tap → select the seat.
    if (wasSinglePointer && !gestureRef.current.moved) {
      const seat = pickSeatAt(e.clientX, e.clientY);
      if (seat) {
        setFocusedSeat(seat.id);
        toggleSeat(seat.id);
      }
    }
    if (pointers.size === 0) gestureRef.current.moved = false;
  };

  const ensureVisible = (seatX: number, seatY: number) => {
    const screen = worldToScreen({ x: seatX, y: seatY }, transform);
    if (
      screen.x < 0 ||
      screen.y < 0 ||
      screen.x > size.width ||
      screen.y > size.height
    ) {
      setTransform({
        scale: transform.scale,
        offsetX: size.width / 2 - seatX * transform.scale,
        offsetY: size.height / 2 - seatY * transform.scale,
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!venue) return;
    const direction = directionFromKey(e.key);
    if (direction) {
      e.preventDefault();
      const current = focusedSeatId
        ? venue.seatsById.get(focusedSeatId)
        : undefined;
      const target = current
        ? nextSeat(venue, current, direction)
        : initialFocusSeat(venue);
      if (target) {
        setFocusedSeat(target.id);
        ensureVisible(target.x, target.y);
      }
      return;
    }
    if (isActivationKey(e.key) && focusedSeatId) {
      e.preventDefault();
      toggleSeat(focusedSeatId);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    const nextScale = clampScale(
      transform.scale * factor,
      MIN_SCALE,
      MAX_SCALE,
    );
    setTransform(
      zoomAround(
        transform,
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        nextScale,
      ),
    );
  };

  const handleFocus = () => {
    if (venue && !focusedSeatId) {
      const seat = initialFocusSeat(venue);
      if (seat) setFocusedSeat(seat.id);
    }
  };

  const focusedSeat =
    focusedSeatId && venue ? venue.seatsById.get(focusedSeatId) : undefined;
  const ariaLabel = focusedSeat
    ? `Seating map. Focused on section ${venue?.sectionsById.get(focusedSeat.sectionId)?.label}, row ${venue?.rowsById.get(focusedSeat.rowId)?.label}, seat ${focusedSeat.label}. Use arrow keys to move, Enter to select.`
    : "Seating map. Press Tab then arrow keys to navigate seats, Enter to select.";

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative h-full w-full overflow-hidden rounded-lg border bg-card",
        className,
      )}
    >
      <canvas
        ref={canvasRef}
        role="application"
        tabIndex={0}
        aria-label={ariaLabel}
        className="block size-full cursor-grab touch-none outline-none active:cursor-grabbing"
        style={{ width: size.width, height: size.height }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onKeyDown={handleKeyDown}
        onWheel={handleWheel}
        onFocus={handleFocus}
      />
      <SeatToolbar viewport={size} className="absolute right-3 top-3" />
    </div>
  );
}

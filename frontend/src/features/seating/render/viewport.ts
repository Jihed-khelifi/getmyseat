/**
 * Viewport transforms — the single source of truth for world ⇄ screen math.
 *
 * Ownership (plan 02): every coordinate conversion in the app goes through here.
 * Duplicating this math elsewhere is the documented cause of pan/zoom drift, so
 * hit-testing, drawing, and keyboard centering all import these helpers.
 *
 * Model: screen = world * scale + offset.
 */
import type { Seat, ViewportTransform, VenueMap } from "../model/seat-types";

export interface ScreenPoint {
  x: number;
  y: number;
}
export interface WorldPoint {
  x: number;
  y: number;
}

export const IDENTITY_TRANSFORM: ViewportTransform = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

export function worldToScreen(
  p: WorldPoint,
  t: ViewportTransform,
): ScreenPoint {
  return {
    x: p.x * t.scale + t.offsetX,
    y: p.y * t.scale + t.offsetY,
  };
}

export function screenToWorld(
  p: ScreenPoint,
  t: ViewportTransform,
): WorldPoint {
  return {
    x: (p.x - t.offsetX) / t.scale,
    y: (p.y - t.offsetY) / t.scale,
  };
}

/** Clamp a desired scale into the allowed zoom range. */
export function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale));
}

/**
 * Translate the viewport by a screen-space delta (drag-to-pan / two-finger pan).
 * Scale is untouched; only the offset moves, so no world ⇄ screen drift occurs.
 */
export function panBy(
  t: ViewportTransform,
  dx: number,
  dy: number,
): ViewportTransform {
  return {
    scale: t.scale,
    offsetX: t.offsetX + dx,
    offsetY: t.offsetY + dy,
  };
}

/**
 * Compute the transform that fits the whole venue map inside a viewport of the
 * given pixel size, centered, with optional padding. Used for "reset view".
 */
export function fitToViewport(
  map: VenueMap,
  viewportWidth: number,
  viewportHeight: number,
  padding = 24,
): ViewportTransform {
  const usableW = Math.max(1, viewportWidth - padding * 2);
  const usableH = Math.max(1, viewportHeight - padding * 2);
  const scale = Math.min(usableW / map.width, usableH / map.height);
  const offsetX = (viewportWidth - map.width * scale) / 2;
  const offsetY = (viewportHeight - map.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

/**
 * Produce a transform that keeps `world` pinned under `screen` while applying a
 * new scale — the core of "zoom toward the cursor/pinch focal point".
 */
export function zoomAround(
  t: ViewportTransform,
  screen: ScreenPoint,
  nextScale: number,
): ViewportTransform {
  const world = screenToWorld(screen, t);
  return {
    scale: nextScale,
    offsetX: screen.x - world.x * nextScale,
    offsetY: screen.y - world.y * nextScale,
  };
}

/** Center the viewport on a seat (used when keyboard focus moves off-screen). */
export function centerOnSeat(
  seat: Seat,
  viewportWidth: number,
  viewportHeight: number,
  scale: number,
): ViewportTransform {
  return {
    scale,
    offsetX: viewportWidth / 2 - seat.x * scale,
    offsetY: viewportHeight / 2 - seat.y * scale,
  };
}

import { describe, expect, it } from "vitest";
import {
  fitToViewport,
  screenToWorld,
  worldToScreen,
  zoomAround,
} from "./viewport";

describe("viewport transforms", () => {
  it("round-trips world → screen → world", () => {
    const t = { scale: 1.7, offsetX: 42, offsetY: -13 };
    const world = { x: 123.4, y: -87.6 };
    const back = screenToWorld(worldToScreen(world, t), t);
    expect(back.x).toBeCloseTo(world.x, 6);
    expect(back.y).toBeCloseTo(world.y, 6);
  });

  it("fits a venue map centered within the viewport", () => {
    const t = fitToViewport({ width: 1000, height: 500 }, 600, 600, 0);
    expect(t.scale).toBeCloseTo(0.6, 6); // width-constrained
    // Centered vertically: 500 * 0.6 = 300, leftover 300 split → offsetY 150.
    expect(t.offsetY).toBeCloseTo(150, 6);
    expect(t.offsetX).toBeCloseTo(0, 6);
  });

  it("keeps the focal point pinned while zooming", () => {
    const t = { scale: 1, offsetX: 0, offsetY: 0 };
    const focal = { x: 200, y: 150 };
    const next = zoomAround(t, focal, 2.5);
    const after = worldToScreen(screenToWorld(focal, t), next);
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
  });
});

import { describe, expect, it } from "vitest";
import {
  clampScale,
  panByScreen,
  rectToScreen,
  rectToWorld,
  screenToWorldLength,
  toScreen,
  toWorld,
  type Viewport,
  viewportCenterWorld,
  visibleWorldRect,
  worldToScreenLength,
  zoomAt,
} from "./coords";

const view: Viewport = { scale: 2, offset: { x: 30, y: -10 } };

describe("toScreen / toWorld", () => {
  it("applies scale then offset", () => {
    expect(toScreen({ x: 10, y: 5 }, view)).toEqual({ x: 50, y: 0 });
  });

  it("round-trips a point through both directions", () => {
    const world = { x: -123.5, y: 77.25 };
    expect(toWorld(toScreen(world, view), view)).toEqual(world);
  });

  it("is the identity at scale 1 with no offset", () => {
    const identity: Viewport = { scale: 1, offset: { x: 0, y: 0 } };
    expect(toScreen({ x: 4, y: 9 }, identity)).toEqual({ x: 4, y: 9 });
  });
});

describe("lengths", () => {
  it("scales without translating", () => {
    expect(worldToScreenLength(8, view)).toBe(16);
    expect(screenToWorldLength(16, view)).toBe(8);
  });
});

describe("rects", () => {
  it("round-trips a rect", () => {
    const rect = { x: 5, y: 5, width: 40, height: 20 };
    expect(rectToWorld(rectToScreen(rect, view), view)).toEqual(rect);
  });

  it("reports the visible world slice, which shrinks as you zoom in", () => {
    const size = { width: 800, height: 600 };
    const zoomedOut: Viewport = { scale: 0.5, offset: { x: 0, y: 0 } };

    expect(visibleWorldRect(zoomedOut, size)).toEqual({
      x: 0,
      y: 0,
      width: 1600,
      height: 1200,
    });
    expect(
      visibleWorldRect({ scale: 2, offset: { x: 0, y: 0 } }, size).width,
    ).toBe(400);
  });

  it("finds the world point at the middle of the viewport", () => {
    const center = viewportCenterWorld(view, { width: 800, height: 600 });
    expect(toScreen(center, view)).toEqual({ x: 400, y: 300 });
  });
});

describe("zoomAt", () => {
  it("keeps the world point under the anchor pinned to it", () => {
    const anchor = { x: 250, y: 140 };
    const before = toWorld(anchor, view);
    const after = toWorld(anchor, zoomAt(view, anchor, 3.5));

    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("returns the same viewport when the scale does not change", () => {
    expect(zoomAt(view, { x: 1, y: 2 }, view.scale)).toBe(view);
  });
});

describe("panByScreen", () => {
  it("moves the world under the pointer by the drag distance", () => {
    const panned = panByScreen(view, 40, -25);

    expect(panned.scale).toBe(view.scale);
    expect(panned.offset).toEqual({ x: 70, y: -35 });
    // A drag of 40 screen px at 2× is 20 world units of travel.
    expect(toWorld({ x: 0, y: 0 }, panned).x).toBe(
      toWorld({ x: 0, y: 0 }, view).x - 20,
    );
  });
});

describe("clampScale", () => {
  it("holds the scale inside the zoom limits", () => {
    expect(clampScale(12, 0.05, 8)).toBe(8);
    expect(clampScale(0.001, 0.05, 8)).toBe(0.05);
    expect(clampScale(1.5, 0.05, 8)).toBe(1.5);
  });
});

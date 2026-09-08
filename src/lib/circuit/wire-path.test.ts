import { describe, expect, it } from "vitest";
import type { Point } from "./schema";
import {
  pendingWirePath,
  simplifyPath,
  smoothPath,
  wirePath,
} from "./wire-path";

/** Does the polyline actually run through `point`, vertex or not? */
function expectPassesThrough(points: readonly Point[], point: Point) {
  const hit = points.slice(1).some((b, i) => {
    const a = points[i];
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const withinX =
      point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x);
    const withinY =
      point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y);
    return Math.abs(cross) < 1e-6 && withinX && withinY;
  });
  expect(hit, `path does not pass through (${point.x}, ${point.y})`).toBe(true);
}

describe("wirePath", () => {
  it("runs straight between facing pins on the same row", () => {
    const { points, slots } = wirePath(
      { x: 0, y: 0 },
      "right",
      { x: 100, y: 0 },
      "left",
    );
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    // One segment, and a bend dropped on it is the wire's first waypoint.
    expect(slots).toEqual([0]);
  });

  it("keeps the pin endpoints as the first and last points", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 130, y: 70 };
    const { points } = wirePath(from, "right", to, "left");
    expect(points[0]).toEqual(from);
    expect(points[points.length - 1]).toEqual(to);
  });

  it("crosses offset pins on one diagonal instead of two bends", () => {
    // The Manhattan router used to put a midpoint dogleg here (ADR 0006).
    expect(
      wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 40 }, "left").points,
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 90, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it("leaves every pin perpendicular to its own edge", () => {
    const { points } = wirePath(
      { x: 0, y: 0 },
      "top",
      { x: 70, y: 30 },
      "bottom",
    );
    // The first and last steps are the stubs, and only the stubs.
    expect(points[1]).toEqual({ x: 0, y: -10 });
    expect(points[points.length - 2]).toEqual({ x: 70, y: 40 });
  });

  it("routes through hand-placed waypoints instead of auto-routing", () => {
    const waypoint = { x: 30, y: 60 };
    const { points } = wirePath(
      { x: 0, y: 0 },
      "right",
      { x: 100, y: 100 },
      "left",
      [waypoint],
    );

    expectPassesThrough(points, waypoint);
    expect(points).not.toEqual(
      wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "left").points,
    );
  });

  it("keeps a waypoint as a vertex even when it lands on a straight run", () => {
    // It is the handle the user drags, so it must survive simplification —
    // and dropping it would put `slots` out of step with the document.
    const { points, slots } = wirePath(
      { x: 0, y: 0 },
      "right",
      { x: 100, y: 0 },
      "left",
      [{ x: 50, y: 0 }],
    );

    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(slots).toEqual([0, 1]);
  });

  it("numbers the slots so a bend lands between the waypoints it was drawn between", () => {
    const { points, slots } = wirePath(
      { x: 0, y: 0 },
      "right",
      { x: 200, y: 0 },
      "left",
      [
        { x: 60, y: 40 },
        { x: 140, y: 40 },
      ],
    );

    // Every segment of the route reports where a bend dropped on it belongs.
    expect(slots).toHaveLength(points.length - 1);
    expect(slots[0]).toBe(0);
    // The segment between the two waypoints inserts after the first of them.
    const between = points.findIndex((p) => p.x === 60 && p.y === 40);
    expect(slots[between]).toBe(1);
    expect(slots[slots.length - 1]).toBe(2);
  });
});

describe("pendingWirePath", () => {
  it("stubs the pin end only, so the far end tracks the cursor exactly", () => {
    const path = pendingWirePath({ x: 0, y: 0 }, "right", { x: 63, y: -17 });
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 63, y: -17 },
    ]);
  });

  it("runs through the bends dropped so far, in order", () => {
    const path = pendingWirePath({ x: 0, y: 0 }, "right", { x: 90, y: 90 }, [
      { x: 40, y: 0 },
      { x: 40, y: 50 },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 50 },
      { x: 90, y: 90 },
    ]);
  });
});

describe("simplifyPath", () => {
  it("drops repeated points and merges collinear runs", () => {
    expect(
      simplifyPath([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 30 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 30 },
    ]);
  });

  it("merges a collinear run that is diagonal, not only axis-aligned", () => {
    expect(
      simplifyPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 25, y: 25 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 25, y: 25 },
    ]);
  });

  it("keeps a spur that doubles back along the segment it came in on", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 5, y: 0 },
    ];
    expect(simplifyPath(path)).toEqual(path);
  });
});

describe("smoothPath", () => {
  const corner = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 50 },
  ];

  it("starts at the first point and ends at the last", () => {
    const d = smoothPath(corner);
    expect(d.startsWith("M 0 0")).toBe(true);
    expect(d.endsWith("L 50 50")).toBe(true);
  });

  it("replaces each bend with a quadratic centred on it", () => {
    // Rounding pulls back 8 world units along each arm of the corner.
    expect(smoothPath(corner, 8)).toBe("M 0 0 L 42 0 Q 50 0 50 8 L 50 50");
  });

  it("shrinks the radius to fit a segment shorter than two radii", () => {
    const d = smoothPath(
      [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 40 },
      ],
      8,
    );
    expect(d).toBe("M 0 0 L 2 0 Q 4 0 4 2 L 4 40");
  });

  it("draws a straight run with no curve at all", () => {
    expect(
      smoothPath([
        { x: 0, y: 0 },
        { x: 30, y: 30 },
      ]),
    ).toBe("M 0 0 L 30 30");
  });
});

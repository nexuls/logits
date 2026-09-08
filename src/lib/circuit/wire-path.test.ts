import { describe, expect, it } from "vitest";
import type { Point } from "./schema";
import {
  moveSegment,
  pendingWirePath,
  simplifyPath,
  smoothPath,
  waypointsFromPath,
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
    const path = wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 0 }, "left");
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it("keeps the pin endpoints as the first and last points", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 130, y: 70 };
    const path = wirePath(from, "right", to, "left");
    expect(path[0]).toEqual(from);
    expect(path[path.length - 1]).toEqual(to);
  });

  it("crosses offset pins on one diagonal instead of two bends", () => {
    // The Manhattan router used to put a midpoint dogleg here (ADR 0006).
    expect(
      wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 40 }, "left"),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 90, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it("leaves every pin perpendicular to its own edge", () => {
    const path = wirePath({ x: 0, y: 0 }, "top", { x: 70, y: 30 }, "bottom");
    // The first and last steps are the stubs, and only the stubs.
    expect(path[1]).toEqual({ x: 0, y: -10 });
    expect(path[path.length - 2]).toEqual({ x: 70, y: 40 });
  });

  it("routes through hand-placed waypoints instead of auto-routing", () => {
    const waypoint = { x: 30, y: 60 };
    const path = wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "left", [
      waypoint,
    ]);

    expectPassesThrough(path, waypoint);
    // `simplifyPath` folds the waypoint into the straight run it sits on, so
    // it is a point *on* the path rather than necessarily a vertex of it.
    expect(path).not.toEqual(
      wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "left"),
    );
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

describe("moveSegment", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ];

  it("moves a segment in both axes, snapped to the grid", () => {
    const moved = moveSegment(path, 1, { x: 13, y: 24 });
    expect(moved[1]).toEqual({ x: 60, y: 20 });
    expect(moved[2]).toEqual({ x: 60, y: 60 });
  });

  it("splits a new bend off rather than dragging an endpoint off its pin", () => {
    const moved = moveSegment(path, 0, { x: 0, y: 20 });
    expect(moved[0]).toEqual(path[0]);
    expect(moved.length).toBe(path.length + 1);
  });

  it("anchors the last point when the tail segment is dragged", () => {
    const moved = moveSegment(path, path.length - 2, { x: 0, y: 20 });
    expect(moved[moved.length - 1]).toEqual(path[path.length - 1]);
  });

  it("ignores an out-of-range index", () => {
    expect(moveSegment(path, -1, { x: 10, y: 10 })).toEqual(path);
    expect(moveSegment(path, path.length - 1, { x: 10, y: 10 })).toEqual(path);
  });
});

describe("waypointsFromPath", () => {
  it("drops the pin endpoints, which are derived from the nodes", () => {
    expect(
      waypointsFromPath([
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 40 },
        { x: 100, y: 40 },
      ]),
    ).toEqual([
      { x: 50, y: 0 },
      { x: 50, y: 40 },
    ]);
  });

  it("round-trips: re-routing through stored waypoints reproduces the path", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 100, y: 40 };
    const path = wirePath(from, "right", to, "left");
    const replayed = wirePath(
      from,
      "right",
      to,
      "left",
      waypointsFromPath(path),
    );
    expect(replayed).toEqual(path);
  });
});

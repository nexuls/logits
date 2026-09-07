import { describe, expect, it } from "vitest";
import type { Point } from "./schema";
import {
  moveSegment,
  simplifyPath,
  waypointsFromPath,
  wirePath,
} from "./wire-path";

/** Every segment of a routed wire must be axis-aligned. */
function expectManhattan(points: readonly Point[]) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    expect(
      a.x === b.x || a.y === b.y,
      `segment ${i - 1}→${i} is diagonal`,
    ).toBe(true);
  }
}

/** Does the polyline actually run through `point`, vertex or not? */
function expectPassesThrough(points: readonly Point[], point: Point) {
  const between = (v: number, a: number, b: number) =>
    v >= Math.min(a, b) && v <= Math.max(a, b);

  const hit = points.slice(1).some((b, i) => {
    const a = points[i];
    return a.x === b.x
      ? a.x === point.x && between(point.y, a.y, b.y)
      : a.y === point.y && between(point.x, a.x, b.x);
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

  it("bends at the midpoint when the target is ahead of the pin", () => {
    const path = wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 40 }, "left");
    expectManhattan(path);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 40 },
      { x: 100, y: 40 },
    ]);
  });

  it("detours around instead of doubling back on a feedback wire", () => {
    // Output faces right but the input sits behind it — every latch has one.
    const path = wirePath({ x: 100, y: 0 }, "right", { x: 0, y: 60 }, "left");
    expectManhattan(path);
    expect(path[0]).toEqual({ x: 100, y: 0 });
    expect(path[path.length - 1]).toEqual({ x: 0, y: 60 });
    // It leaves to the right of the source pin before turning back.
    expect(Math.max(...path.map((p) => p.x))).toBeGreaterThan(100);
    expect(Math.min(...path.map((p) => p.x))).toBeLessThan(0);
  });

  it("stays Manhattan across every pin-side combination", () => {
    const sides = ["left", "right", "top", "bottom"] as const;
    for (const fromSide of sides) {
      for (const toSide of sides) {
        expectManhattan(
          wirePath({ x: 0, y: 0 }, fromSide, { x: 70, y: 30 }, toSide),
        );
      }
    }
  });

  it("routes through hand-placed waypoints instead of auto-routing", () => {
    const waypoint = { x: 30, y: 60 };
    const path = wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "left", [
      waypoint,
    ]);

    expectManhattan(path);
    expectPassesThrough(path, waypoint);
    // `simplifyPath` folds the waypoint into the straight run it sits on, so
    // it is a point *on* the path rather than necessarily a vertex of it.
    expect(path).not.toEqual(
      wirePath({ x: 0, y: 0 }, "right", { x: 100, y: 100 }, "left"),
    );
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
});

describe("moveSegment", () => {
  const path = [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 40 },
    { x: 100, y: 40 },
  ];

  it("moves a vertical segment in x only, snapped to the grid", () => {
    const moved = moveSegment(path, 1, { x: 13, y: 99 });
    expect(moved[1]).toEqual({ x: 60, y: 0 });
    expect(moved[2]).toEqual({ x: 60, y: 40 });
    expectManhattan(moved);
  });

  it("splits a new bend off rather than dragging an endpoint off its pin", () => {
    const moved = moveSegment(path, 0, { x: 0, y: 20 });
    expect(moved[0]).toEqual(path[0]);
    expect(moved.length).toBe(path.length + 1);
    expectManhattan(moved);
  });

  it("anchors the last point when the tail segment is dragged", () => {
    const moved = moveSegment(path, path.length - 2, { x: 0, y: 20 });
    expect(moved[moved.length - 1]).toEqual(path[path.length - 1]);
    expectManhattan(moved);
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

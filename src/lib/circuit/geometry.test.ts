import { describe, expect, it } from "vitest";
import {
  GRID_SIZE,
  nodeBounds,
  pinOffsets,
  rectContains,
  rectsIntersect,
  rotateSide,
  rotateSize,
  snapPointToGrid,
  snapToGrid,
} from "./geometry";
import type { PinSpec } from "./schema";

const pin = (over: Partial<PinSpec> = {}): PinSpec => ({
  id: "a",
  name: "A",
  direction: "in",
  width: 1,
  side: "left",
  offset: 1,
  ...over,
});

describe("rotateSide", () => {
  it("steps clockwise through the sides", () => {
    expect(rotateSide("top", 90)).toBe("right");
    expect(rotateSide("right", 90)).toBe("bottom");
    expect(rotateSide("bottom", 90)).toBe("left");
    expect(rotateSide("left", 90)).toBe("top");
  });

  it("wraps at a full turn and reverses at 180", () => {
    expect(rotateSide("left", 0)).toBe("left");
    expect(rotateSide("left", 180)).toBe("right");
    expect(rotateSide("left", 270)).toBe("bottom");
  });
});

describe("rotateSize", () => {
  const size = { width: 4, height: 2 };

  it("swaps the box on a quarter turn only", () => {
    expect(rotateSize(size, 0)).toEqual(size);
    expect(rotateSize(size, 180)).toEqual(size);
    expect(rotateSize(size, 90)).toEqual({ width: 2, height: 4 });
    expect(rotateSize(size, 270)).toEqual({ width: 2, height: 4 });
  });
});

describe("snapToGrid", () => {
  it("rounds to the nearest cell, halves away from zero", () => {
    expect(snapToGrid(0)).toBe(0);
    expect(snapToGrid(4)).toBe(0);
    expect(snapToGrid(5)).toBe(GRID_SIZE);
    expect(snapToGrid(-14)).toBe(-GRID_SIZE);
    expect(snapPointToGrid({ x: 12, y: -8 })).toEqual({ x: 10, y: -10 });
  });
});

describe("pinOffsets", () => {
  const size = { width: 4, height: 2 };

  it("places pins on the named edge in world units", () => {
    const [left, right, top] = pinOffsets(
      [
        pin({ id: "l", side: "left", offset: 1 }),
        pin({ id: "r", side: "right", offset: 1 }),
        pin({ id: "t", side: "top", offset: 2 }),
      ],
      size,
    );

    expect(left).toMatchObject({ side: "left", dx: 0, dy: 10 });
    expect(right).toMatchObject({ side: "right", dx: 40, dy: 10 });
    expect(top).toMatchObject({ side: "top", dx: 20, dy: 0 });
  });

  it("keeps every pin inside the rotated box", () => {
    for (const rotation of [0, 90, 180, 270] as const) {
      const rotated = rotateSize(size, rotation);
      const offsets = pinOffsets(
        [
          pin({ id: "l", side: "left", offset: 1 }),
          pin({ id: "r", side: "right", offset: 1 }),
          pin({ id: "b", side: "bottom", offset: 3 }),
        ],
        size,
        rotation,
      );

      for (const offset of offsets) {
        expect(offset.dx).toBeGreaterThanOrEqual(0);
        expect(offset.dy).toBeGreaterThanOrEqual(0);
        expect(offset.dx).toBeLessThanOrEqual(rotated.width * GRID_SIZE);
        expect(offset.dy).toBeLessThanOrEqual(rotated.height * GRID_SIZE);
      }
    }
  });

  it("moves a pin to the side its stub points at after rotation", () => {
    const [rotated] = pinOffsets([pin({ side: "left", offset: 1 })], size, 90);
    // A left pin turned a quarter turn clockwise now leaves through the top.
    expect(rotated.side).toBe("top");
    expect(rotated.dy).toBe(0);
  });

  it("does not depend on the node's position", () => {
    // Regression guard for the split the module documents: dragging a node
    // must never invalidate cached pin geometry.
    const once = pinOffsets([pin()], size, 90);
    expect(pinOffsets([pin()], size, 90)).toEqual(once);
  });
});

describe("rects", () => {
  const bounds = nodeBounds({ x: 20, y: 30 }, { width: 4, height: 2 });

  it("derives world bounds from position and rotated size", () => {
    expect(bounds).toEqual({ x: 20, y: 30, width: 40, height: 20 });
  });

  it("hit-tests inclusively on the edge", () => {
    expect(rectContains(bounds, { x: 20, y: 30 })).toBe(true);
    expect(rectContains(bounds, { x: 60, y: 50 })).toBe(true);
    expect(rectContains(bounds, { x: 61, y: 50 })).toBe(false);
  });

  it("intersects on touch but not on a gap", () => {
    expect(rectsIntersect(bounds, { x: 60, y: 30, width: 5, height: 5 })).toBe(
      true,
    );
    expect(rectsIntersect(bounds, { x: 61, y: 30, width: 5, height: 5 })).toBe(
      false,
    );
  });
});

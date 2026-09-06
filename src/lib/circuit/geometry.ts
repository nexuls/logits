import type { PinSpec, Point, Rotation } from "./schema";

/**
 * Node geometry: sizes, rotation, and pin placement.
 *
 * Everything here is a pure function of a node's *definition* output plus its
 * rotation — never of its `position`. That split is deliberate: dragging a node
 * changes its position every frame but cannot change any of this, so callers
 * cache these results and add the position on read. See
 * artifacts/decisions/0004-derived-scene-graph.md.
 *
 * Nothing computed here is ever written back to the document.
 */

/** World units per grid cell. Node `size()` and pin `offset` are in cells. */
export const GRID_SIZE = 10;

/** Node extents, in grid cells — the unit `NodeDefinition.size()` returns. */
export type Size = { width: number; height: number };

/** An axis-aligned box in world units. */
export type Rect = { x: number; y: number; width: number; height: number };

/** A pin's placement relative to its node's top-left, in world units. */
export type PinOffset = {
  spec: PinSpec;
  /** Which edge the pin sits on *after* rotation — where its stub points. */
  side: PinSpec["side"];
  dx: number;
  dy: number;
};

/** Clockwise from the top, so `rotation / 90` is the number of steps. */
const SIDES = ["top", "right", "bottom", "left"] as const;

export function rotateSide(
  side: PinSpec["side"],
  rotation: Rotation,
): PinSpec["side"] {
  return SIDES[(SIDES.indexOf(side) + rotation / 90) % 4];
}

/** A quarter turn swaps the bounding box; a half turn leaves it alone. */
export function rotateSize(size: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270
    ? { width: size.height, height: size.width }
    : size;
}

export function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function snapPointToGrid(point: Point): Point {
  return { x: snapToGrid(point.x), y: snapToGrid(point.y) };
}

/**
 * Places every pin relative to the node origin, with rotation applied.
 *
 * `position` stays the top-left of what the user sees, so a quarter turn
 * re-anchors the shape into the swapped box rather than pivoting it off its
 * own origin — otherwise rotating a node would appear to move it.
 */
export function pinOffsets(
  pins: readonly PinSpec[],
  size: Size,
  rotation: Rotation = 0,
): PinOffset[] {
  const width = size.width * GRID_SIZE;
  const height = size.height * GRID_SIZE;

  return pins.map((spec) => {
    const along = spec.offset * GRID_SIZE;
    // Unrotated placement: `offset` runs along the named edge.
    const x = spec.side === "right" ? width : spec.side === "left" ? 0 : along;
    const y = spec.side === "bottom" ? height : spec.side === "top" ? 0 : along;

    const rotated = rotatePoint(x, y, width, height, rotation);
    return { spec, side: rotateSide(spec.side, rotation), ...rotated };
  });
}

/** Rotates a point clockwise inside a `width` × `height` box, re-anchored to (0,0). */
function rotatePoint(
  x: number,
  y: number,
  width: number,
  height: number,
  rotation: Rotation,
): { dx: number; dy: number } {
  switch (rotation) {
    case 90:
      return { dx: height - y, dy: x };
    case 180:
      return { dx: width - x, dy: height - y };
    case 270:
      return { dx: y, dy: width - x };
    default:
      return { dx: x, dy: y };
  }
}

/** World-space box of a node, for culling and hit-testing. */
export function nodeBounds(position: Point, rotatedSize: Size): Rect {
  return {
    x: position.x,
    y: position.y,
    width: rotatedSize.width * GRID_SIZE,
    height: rotatedSize.height * GRID_SIZE,
  };
}

export function rectContains(rect: Rect, point: Point): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x <= b.x + b.width &&
    b.x <= a.x + a.width &&
    a.y <= b.y + b.height &&
    b.y <= a.y + a.height
  );
}

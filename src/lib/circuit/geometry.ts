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

/**
 * Which way round a node ended up. A quarter turn swaps its axes, so a view
 * with a direction of its own — a gate pointing right, an arrowhead, a name
 * set along the body — draws itself along this rather than reading `rotation`
 * and re-deriving the same two cases.
 */
export type Orientation = "horizontal" | "vertical";

export function orientationOf(rotation: Rotation = 0): Orientation {
  return rotation === 90 || rotation === 270 ? "vertical" : "horizontal";
}

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

/**
 * A resize handle, by which way it faces: `-1` is the left or top edge, `1`
 * the right or bottom, `0` the middle of the other two.
 */
export type ResizeHandle = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

/** Corners first, so where handles overlap on a small box a corner wins. */
export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** Where a handle sits on a box, in the box's own units. */
export function handlePoint(rect: Rect, handle: ResizeHandle): Point {
  return {
    x: rect.x + ((handle.x + 1) / 2) * rect.width,
    y: rect.y + ((handle.y + 1) / 2) * rect.height,
  };
}

/** Footprint bounds in grid cells, already rotated to match the box. */
export type SizeLimits = { min: Size; max: Size };

/**
 * Where a box ends up when one of its handles is dragged by a world `delta`.
 *
 * The edge opposite the handle stays put, and the moving edge snaps to the
 * grid rather than the delta — a box off the grid lands back on it, the way a
 * moved node does. The size comes out in whole cells, clamped, so a box
 * dragged past its minimum stops against the fixed edge instead of flipping
 * inside out. A handle in the middle of an edge leaves the other axis alone.
 */
export function resizeBox(
  start: Rect,
  handle: ResizeHandle,
  delta: Point,
  limits: SizeLimits,
  snap = true,
): { position: Point; size: Size } {
  const axis = (
    from: number,
    length: number,
    direction: -1 | 0 | 1,
    moved: number,
    min: number,
    max: number,
  ) => {
    if (direction === 0) {
      return { from, cells: Math.round(length / GRID_SIZE) };
    }

    const end = from + length;
    const raw = (direction < 0 ? from : end) + moved;
    const edge = snap ? snapToGrid(raw) : raw;
    const span = direction < 0 ? end - edge : edge - from;
    const cells = Math.min(max, Math.max(min, Math.round(span / GRID_SIZE)));

    return { from: direction < 0 ? end - cells * GRID_SIZE : from, cells };
  };

  const x = axis(
    start.x,
    start.width,
    handle.x,
    delta.x,
    limits.min.width,
    limits.max.width,
  );
  const y = axis(
    start.y,
    start.height,
    handle.y,
    delta.y,
    limits.min.height,
    limits.max.height,
  );

  return {
    position: { x: x.from, y: y.from },
    size: { width: x.cells, height: y.cells },
  };
}

/**
 * Most copies of one element a single palette click may queue up.
 *
 * A cap exists because the batch is drawn as a ghost under the cursor and
 * placed as one undo step; past a couple of rows it stops reading as "what I
 * am about to drop" and starts hiding the circuit underneath.
 */
export const MAX_PLACEMENT_COUNT = 6;

/** Copies per row when a batch is placed by one click. */
const PLACEMENT_COLUMNS = 3;

/**
 * Centres for `count` copies of a node dropped at `worldCenter`.
 *
 * Rows of at most three, centred on the cursor, so a batch grows around the
 * point that was clicked instead of trailing off it — and a short last row
 * stays under the ones above rather than hanging to the left. The gap is one
 * grid cell, which keeps each body clear of its neighbour's pin stubs.
 *
 * The ghost preview and the placement command both read from here, which is
 * what makes the preview honest.
 */
export function placementCenters(
  worldCenter: Point,
  rotatedSize: Size,
  count: number,
): Point[] {
  const rows = Math.ceil(count / PLACEMENT_COLUMNS);
  const stepX = (rotatedSize.width + 1) * GRID_SIZE;
  const stepY = (rotatedSize.height + 1) * GRID_SIZE;

  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / PLACEMENT_COLUMNS);
    const column = index % PLACEMENT_COLUMNS;
    const inRow = Math.min(count - row * PLACEMENT_COLUMNS, PLACEMENT_COLUMNS);

    return {
      x: worldCenter.x + (column - (inRow - 1) / 2) * stepX,
      y: worldCenter.y + (row - (rows - 1) / 2) * stepY,
    };
  });
}

import {
  type Rect,
  rectContains,
  rectsIntersect,
} from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import type { ResolvedNode, ResolvedPin, ResolvedWire, Scene } from "./scene";

/**
 * Picking: what is under a world point, and what falls inside a world rect.
 *
 * Pure and scene-only — no DOM, no events, no pointer state. The gesture hooks
 * convert a pointer position to world coordinates through `coords.ts` and ask
 * these functions; keeping the geometry here is what lets it be tested without
 * a browser, and what stops two call sites growing two slightly different
 * ideas of "close enough to a wire".
 *
 * It sits beside `scene.ts` rather than in `src/lib/circuit/` because it takes
 * a `Scene`, and the domain layer may not depend on anything above it. Like
 * the scene it is still plain functions — no React, no `window`.
 *
 * Every tolerance is a *world* length. Callers pass one converted from screen
 * pixels with `screenToWorldLength`, so a hit target stays the same physical
 * size at every zoom.
 */

/** How near a pin counts as on it. ~10 screen px at 1×, per the interaction spec. */
export const PIN_HIT_RADIUS = 6;

/** Half the clickable thickness of a wire. */
export const WIRE_HIT_RADIUS = 4;

export type PinHit = { node: ResolvedNode; pin: ResolvedPin };

export type WireHit = {
  wire: ResolvedWire;
  /** Segment between `points[index]` and `points[index + 1]`. */
  index: number;
  /** World distance from the query point to that segment. */
  distance: number;
};

/**
 * The pin nearest `world` within `radius`, or null.
 *
 * Nearest rather than first: pins on a small node at low zoom overlap, and the
 * user means the one they aimed at. Ties break on node then pin id so the
 * result does not depend on scene iteration order.
 */
export function pinAt(
  scene: Scene,
  world: Point,
  radius = PIN_HIT_RADIUS,
): PinHit | null {
  let best: PinHit | null = null;
  let bestDistance = Infinity;

  for (const nodeId of Object.keys(scene.nodes).sort()) {
    const node = scene.nodes[nodeId];
    for (const pin of node.pins) {
      const distance = Math.hypot(pin.world.x - world.x, pin.world.y - world.y);
      // Strictly nearer, so an exact tie keeps the earlier id and the walk
      // stays deterministic.
      if (distance <= radius && distance < bestDistance) {
        best = { node, pin };
        bestDistance = distance;
      }
    }
  }

  return best;
}

/**
 * The topmost node whose body contains `world`.
 *
 * "Topmost" is the last in sorted id order, matching the order the node layer
 * renders in — so what the user clicks is what they see on top.
 */
export function nodeAt(scene: Scene, world: Point): ResolvedNode | null {
  let found: ResolvedNode | null = null;
  for (const nodeId of Object.keys(scene.nodes).sort()) {
    const node = scene.nodes[nodeId];
    if (rectContains(node.bounds, world)) found = node;
  }
  return found;
}

/** The wire segment nearest `world` within `radius`, or null. */
export function wireAt(
  scene: Scene,
  world: Point,
  radius = WIRE_HIT_RADIUS,
): WireHit | null {
  let best: WireHit | null = null;

  for (const wireId of Object.keys(scene.wires).sort()) {
    const wire = scene.wires[wireId];
    for (let index = 0; index + 1 < wire.points.length; index++) {
      const distance = distanceToSegment(
        world,
        wire.points[index],
        wire.points[index + 1],
      );
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { wire, index, distance };
      }
    }
  }

  return best;
}

export type RectSelection = { nodeIds: string[]; wireIds: string[] };

/**
 * Rubber-band selection.
 *
 * A node is caught when the band *touches* it rather than encloses it, which
 * is what a schematic editor's lasso does — enclosure would make selecting a
 * wide bus impossible without zooming out. A wire is caught when any of its
 * segments crosses the band, so dragging across a bundle picks all of it up.
 */
export function elementsInRect(scene: Scene, rect: Rect): RectSelection {
  const nodeIds = Object.keys(scene.nodes)
    .filter((id) => rectsIntersect(scene.nodes[id].bounds, rect))
    .sort();

  const wireIds = Object.keys(scene.wires)
    .filter((id) => {
      const { points } = scene.wires[id];
      for (let index = 0; index + 1 < points.length; index++) {
        if (segmentIntersectsRect(points[index], points[index + 1], rect)) {
          return true;
        }
      }
      return false;
    })
    .sort();

  return { nodeIds, wireIds };
}

/** World-space box between two corners, in any drag direction. */
export function rectBetween(a: Point, b: Point): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * Whether a wire may legally join these two pins.
 *
 * Deliberately permissive: only a direction clash is refused, because a width
 * clash is a `width-mismatch` diagnostic the user is allowed to create and
 * then see (artifacts/07-interaction-spec.md). What this drives is the
 * highlight while dragging, so it must agree with what `connect` will accept.
 */
export function pinsCompatible(a: ResolvedPin, b: ResolvedPin): boolean {
  if (a.spec.direction === "inout" || b.spec.direction === "inout") return true;
  return a.spec.direction !== b.spec.direction;
}

/** Same widths, so the connection would raise no diagnostic at all. */
export function pinsMatchExactly(a: ResolvedPin, b: ResolvedPin): boolean {
  return pinsCompatible(a, b) && a.spec.width === b.spec.width;
}

function distanceToSegment(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  // A zero-length segment is a point; `t` would be 0/0.
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
          ),
        );

  return Math.hypot(a.x + t * dx - point.x, a.y + t * dy - point.y);
}

/**
 * Segments are axis-aligned by construction (`wire-path.ts` orthogonalises
 * every path), so this is an overlap test on two intervals rather than a
 * general segment/box clip.
 */
function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  const segment = {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
  return rectsIntersect(segment, rect);
}

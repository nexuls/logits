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

/** How near a pin counts as on it. ~14 screen px at 1×, per the interaction spec. */
export const PIN_HIT_RADIUS = 9;

/** Half the clickable thickness of a wire. */
export const WIRE_HIT_RADIUS = 6;

/** How near a waypoint handle counts as on it. Slightly wider than it draws. */
export const WAYPOINT_HIT_RADIUS = 7;

export type PinHit = { node: ResolvedNode; pin: ResolvedPin };

export type WireHit = {
  wire: ResolvedWire;
  /** Segment between `points[index]` and `points[index + 1]`. */
  index: number;
  /** The point on that segment nearest the query — where a bend would go. */
  point: Point;
  /** World distance from the query point to that segment. */
  distance: number;
};

export type WaypointHit = {
  wire: ResolvedWire;
  /** Index into `wire.wire.waypoints` — the document's own bend list. */
  index: number;
  /** World distance from the query point to the handle. */
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

/**
 * The wire segment nearest `world` within `radius`, or null.
 *
 * The hit carries the closest point *on* the segment, which is where a bend
 * dropped here would land — so the preview handle the editor draws under the
 * cursor and the waypoint a press actually inserts are the same point, and
 * cannot drift apart (ADR 0007).
 */
export function wireAt(
  scene: Scene,
  world: Point,
  radius = WIRE_HIT_RADIUS,
): WireHit | null {
  let best: WireHit | null = null;

  for (const wireId of Object.keys(scene.wires).sort()) {
    const wire = scene.wires[wireId];
    for (let index = 0; index + 1 < wire.points.length; index++) {
      const point = closestPointOnSegment(
        world,
        wire.points[index],
        wire.points[index + 1],
      );
      const distance = Math.hypot(point.x - world.x, point.y - world.y);
      if (distance <= radius && (!best || distance < best.distance)) {
        best = { wire, index, point, distance };
      }
    }
  }

  return best;
}

/**
 * The waypoint handle nearest `world`, among `wireIds`, within `radius`.
 *
 * Scoped to a caller-supplied set rather than the whole scene because handles
 * are only drawn for selected wires: a handle nobody can see must not be
 * grabbable, or a press near an unselected wire would silently bend it.
 */
export function waypointAt(
  scene: Scene,
  world: Point,
  wireIds: readonly string[],
  radius = WAYPOINT_HIT_RADIUS,
): WaypointHit | null {
  let best: WaypointHit | null = null;

  for (const wireId of [...wireIds].sort()) {
    const wire = scene.wires[wireId];
    if (!wire) continue;

    const waypoints = wire.wire.waypoints ?? [];
    for (let index = 0; index < waypoints.length; index++) {
      const distance = Math.hypot(
        waypoints[index].x - world.x,
        waypoints[index].y - world.y,
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

/** The point of segment `a → b` nearest `point`, endpoints included. */
function closestPointOnSegment(point: Point, a: Point, b: Point): Point {
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

  return { x: a.x + t * dx, y: a.y + t * dy };
}

/**
 * A real segment/box clip, because segments run at any angle (ADR 0006): a
 * bounding-box overlap would catch a diagonal whose box crosses the band while
 * the wire itself passes well clear of it.
 *
 * Liang–Barsky — the segment is clipped against the four slabs of the rect, and
 * survives if the entry parameter never overtakes the exit one.
 */
function segmentIntersectsRect(a: Point, b: Point, rect: Rect): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let enter = 0;
  let exit = 1;

  const slab = (direction: number, distance: number): boolean => {
    if (direction === 0) {
      // Parallel to this pair of edges: inside them, or missing entirely.
      return distance >= 0;
    }
    const t = distance / direction;
    if (direction < 0) enter = Math.max(enter, t);
    else exit = Math.min(exit, t);
    return true;
  };

  return (
    slab(-dx, a.x - rect.x) &&
    slab(dx, rect.x + rect.width - a.x) &&
    slab(-dy, a.y - rect.y) &&
    slab(dy, rect.y + rect.height - a.y) &&
    enter <= exit
  );
}

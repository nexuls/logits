import { GRID_SIZE, snapToGrid } from "./geometry";
import type { PinSpec, Point } from "./schema";

/**
 * Wire routing: turning two pins and a list of waypoints into a polyline.
 *
 * Wires run at any angle — a segment may be horizontal, vertical or diagonal
 * (ADR 0006). The path is exactly the points the user gave it: a short stub off
 * each pin so the wire leaves the node body perpendicular, then straight runs
 * through every waypoint. Waypoints are the user's bends, stored in the
 * document in absolute world coordinates; everything else here is derived per
 * render and never saved. See artifacts/07-interaction-spec.md.
 *
 * A wire with no waypoints is auto-routed. Storing a waypoint *is* what makes a
 * wire manually routed — there is no separate mode flag, so there is no way for
 * a mode and its geometry to disagree.
 */

type Side = PinSpec["side"];

/** A short lead so a wire leaves its pin perpendicular to the node body. */
const STUB_LENGTH = GRID_SIZE;

/** Corner rounding, in world units, that `smoothPath` aims for at each bend. */
export const WIRE_CORNER_RADIUS = GRID_SIZE * 0.8;

/** Below this a coordinate difference is rounding noise, not a real turn. */
const EPSILON = 1e-6;

function step(point: Point, side: Side, distance: number): Point {
  switch (side) {
    case "left":
      return { x: point.x - distance, y: point.y };
    case "right":
      return { x: point.x + distance, y: point.y };
    case "top":
      return { x: point.x, y: point.y - distance };
    default:
      return { x: point.x, y: point.y + distance };
  }
}

/**
 * The full polyline for a wire, pin endpoints included, in world coordinates.
 *
 * Pure and cheap: no obstacle avoidance, no node awareness. A wire may cross a
 * node — that is the user's problem to fix by bending it, which is exactly what
 * waypoints are for.
 *
 * With no waypoints the route is the straight line between the two stubs, at
 * whatever angle that is. There is no midpoint bend to insert any more: a
 * diagonal is one segment, and a bend the user did not ask for is a bend they
 * have to undo.
 */
export function wirePath(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  waypoints: readonly Point[] = [],
): Point[] {
  return simplifyPath([
    from,
    step(from, fromSide, STUB_LENGTH),
    ...waypoints,
    step(to, toSide, STUB_LENGTH),
    to,
  ]);
}

/**
 * The polyline for a wire still being drawn, whose far end is the cursor.
 *
 * Only the anchored end gets a stub: the cursor end has no pin yet, so giving
 * it one would make the preview lag behind the pointer by a grid cell.
 */
export function pendingWirePath(
  from: Point,
  fromSide: Side,
  cursor: Point,
  waypoints: readonly Point[] = [],
): Point[] {
  return simplifyPath([
    from,
    step(from, fromSide, STUB_LENGTH),
    ...waypoints,
    cursor,
  ]);
}

/** Drops zero-length segments and merges runs that continue in one direction. */
export function simplifyPath(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && samePoint(last, point)) continue;

    const previous = out[out.length - 2];
    if (previous && last && isCollinear(previous, last, point)) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

/**
 * Do `a → b → c` continue in one direction?
 *
 * The cross product is scaled by the two segment lengths, so the tolerance is a
 * *shape* tolerance rather than an absolute one: a hair of a kink survives on a
 * short segment and is folded away on a long one, instead of the reverse.
 */
function isCollinear(a: Point, b: Point, c: Point): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const bcx = c.x - b.x;
  const bcy = c.y - b.y;
  const cross = abx * bcy - aby * bcx;
  const scale = Math.hypot(abx, aby) * Math.hypot(bcx, bcy);
  // Also require the second segment to keep going forward, so a spur that
  // doubles back exactly along the first is kept as the bend it is.
  return Math.abs(cross) <= scale * 1e-9 && abx * bcx + aby * bcy > 0;
}

/**
 * An SVG `d` string for a polyline with its corners rounded off.
 *
 * Each bend is replaced by a quadratic through the two points `radius` back
 * along the segments either side of it, which is the cheapest curve that is
 * tangent to both — so the wire never bulges outside the polyline the
 * hit-test uses. The radius shrinks to fit short segments, so a tight zigzag
 * degrades to a sharper corner instead of overshooting into its neighbour.
 */
export function smoothPath(
  points: readonly Point[],
  radius = WIRE_CORNER_RADIUS,
): string {
  if (points.length === 0) return "";

  const first = points[0];
  let d = `M ${round(first.x)} ${round(first.y)}`;

  for (let i = 1; i < points.length - 1; i++) {
    const previous = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];

    const inLength = distance(previous, corner);
    const outLength = distance(corner, next);
    // Half, not the whole segment: two consecutive corners must each keep to
    // their own side of the segment they share or the curves would overlap.
    const r = Math.min(radius, inLength / 2, outLength / 2);
    if (r < EPSILON) continue;

    const start = towards(corner, previous, r);
    const end = towards(corner, next, r);
    d += ` L ${round(start.x)} ${round(start.y)}`;
    d += ` Q ${round(corner.x)} ${round(corner.y)} ${round(end.x)} ${round(end.y)}`;
  }

  const last = points[points.length - 1];
  return points.length > 1 ? `${d} L ${round(last.x)} ${round(last.y)}` : d;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** The point `length` from `origin` along the line towards `target`. */
function towards(origin: Point, target: Point, length: number): Point {
  const span = distance(origin, target);
  if (span < EPSILON) return origin;
  const t = length / span;
  return {
    x: origin.x + (target.x - origin.x) * t,
    y: origin.y + (target.y - origin.y) * t,
  };
}

/** Two decimals is well under a device pixel at max zoom, and keeps `d` short. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Drags one segment of a path sideways, the way you would nudge a rope.
 *
 * Free in both axes now that segments may run at any angle. The two pin
 * endpoints are anchored, so grabbing a segment that touches one splits a new
 * bend off it rather than pulling the wire off its pin.
 *
 * `index` addresses the segment between `points[index]` and `points[index + 1]`.
 */
export function moveSegment(
  points: readonly Point[],
  index: number,
  delta: Point,
): Point[] {
  const path = [...points];
  if (index < 0 || index + 1 >= path.length) return path;

  let target = index;
  // Tail first: splicing the head would shift the indices this one depends on.
  if (index + 1 === path.length - 1) {
    path.splice(path.length - 1, 0, { ...path[path.length - 1] });
  }
  if (index === 0) {
    path.splice(1, 0, { ...path[0] });
    target = 1;
  }

  const a = path[target];
  const b = path[target + 1];
  // Snapped per endpoint rather than as one rounded delta, so a segment that
  // started on the grid lands back on it.
  path[target] = { x: snapToGrid(a.x + delta.x), y: snapToGrid(a.y + delta.y) };
  path[target + 1] = {
    x: snapToGrid(b.x + delta.x),
    y: snapToGrid(b.y + delta.y),
  };
  return path;
}

/**
 * The document form of a routed path: the pin endpoints are dropped, because
 * they are derived from the nodes and would go stale the moment one moves.
 */
export function waypointsFromPath(points: readonly Point[]): Point[] {
  return simplifyPath(points.slice(1, -1));
}

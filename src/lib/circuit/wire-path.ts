import { GRID_SIZE, snapToGrid } from "./geometry";
import type { PinSpec, Point } from "./schema";

/**
 * Wire routing: turning two pins and a list of waypoints into a polyline.
 *
 * Wires are Manhattan — every segment is axis-aligned, so a wire bends like a
 * pipe rather than running diagonally. Waypoints are the user's bends, stored
 * in the document in absolute world coordinates; everything else here is
 * derived per render and never saved. See artifacts/07-interaction-spec.md.
 *
 * A wire with no waypoints is auto-routed. Storing a waypoint *is* what makes a
 * wire manually routed — there is no separate mode flag, so there is no way for
 * a mode and its geometry to disagree.
 */

type Side = PinSpec["side"];

/** A short lead so a wire leaves its pin perpendicular to the node body. */
const STUB_LENGTH = GRID_SIZE;

const isHorizontal = (side: Side) => side === "left" || side === "right";

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
 */
export function wirePath(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
  waypoints: readonly Point[] = [],
): Point[] {
  const fromStub = step(from, fromSide, STUB_LENGTH);
  const toStub = step(to, toSide, STUB_LENGTH);
  const middle =
    waypoints.length > 0
      ? waypoints
      : autoRoute(fromStub, fromSide, toStub, toSide);

  return simplifyPath(
    orthogonalize(
      [from, fromStub, ...middle, toStub, to],
      isHorizontal(fromSide),
    ),
  );
}

/**
 * The default two-bend path the interaction spec asks for: pins that face along
 * the same axis meet at the midpoint between them, which is the shape people
 * expect on a schematic. Pins on perpendicular axes need only one corner, and
 * `orthogonalize` inserts it.
 *
 * When the target sits *behind* the source pin the midpoint falls between the
 * two node bodies, and the wire would double back across the node it just left.
 * Feedback is not an edge case here — every latch and oscillator has some — so
 * that case detours perpendicularly instead, giving the four-bend path that
 * goes around.
 */
function autoRoute(
  from: Point,
  fromSide: Side,
  to: Point,
  toSide: Side,
): Point[] {
  const fromH = isHorizontal(fromSide);
  if (fromH !== isHorizontal(toSide)) return [];

  if (fromH) {
    if (isAhead(from.x, to.x, fromSide === "right")) {
      const midX = snapToGrid((from.x + to.x) / 2);
      return [
        { x: midX, y: from.y },
        { x: midX, y: to.y },
      ];
    }
    const midY = snapToGrid((from.y + to.y) / 2);
    return [
      { x: from.x, y: midY },
      { x: to.x, y: midY },
    ];
  }

  if (isAhead(from.y, to.y, fromSide === "bottom")) {
    const midY = snapToGrid((from.y + to.y) / 2);
    return [
      { x: from.x, y: midY },
      { x: to.x, y: midY },
    ];
  }
  const midX = snapToGrid((from.x + to.x) / 2);
  return [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];
}

/** Is the target in the direction the source pin actually points? */
function isAhead(from: number, to: number, increasing: boolean): boolean {
  return increasing ? to >= from : to <= from;
}

/**
 * Inserts a corner wherever two consecutive points share neither axis, so the
 * path stays Manhattan no matter what the waypoints say. This is what keeps a
 * hand-routed wire legal after the node at one end is dragged away.
 *
 * The corner turns *across* the incoming segment's axis, so the path alternates
 * instead of doubling back on itself.
 */
function orthogonalize(points: readonly Point[], startHorizontal: boolean) {
  const out: Point[] = [points[0]];
  let horizontal = startHorizontal;

  for (let i = 1; i < points.length; i++) {
    const previous = out[out.length - 1];
    const next = points[i];
    if (previous.x !== next.x && previous.y !== next.y) {
      out.push(
        horizontal
          ? { x: next.x, y: previous.y }
          : { x: previous.x, y: next.y },
      );
    }
    out.push(next);

    const last = out[out.length - 2];
    if (last.x !== next.x) horizontal = true;
    else if (last.y !== next.y) horizontal = false;
  }
  return out;
}

/** Drops zero-length segments and merges runs that continue along one axis. */
export function simplifyPath(points: readonly Point[]): Point[] {
  const out: Point[] = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && last.x === point.x && last.y === point.y) continue;

    const previous = out[out.length - 2];
    if (
      previous &&
      last &&
      ((previous.x === last.x && last.x === point.x) ||
        (previous.y === last.y && last.y === point.y))
    ) {
      out[out.length - 1] = point;
      continue;
    }
    out.push(point);
  }
  return out;
}

/**
 * Drags one segment of a path sideways, the way you would nudge a pipe.
 *
 * Only the axis the segment can actually move along is honoured — a horizontal
 * segment moves in y, a vertical one in x. The two pin endpoints are anchored,
 * so grabbing a segment that touches one splits a new bend off it rather than
 * pulling the wire off its pin.
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
  const horizontal = a.y === b.y;
  const moved = horizontal
    ? { y: snapToGrid(a.y + delta.y) }
    : { x: snapToGrid(a.x + delta.x) };

  path[target] = { ...a, ...moved };
  path[target + 1] = { ...b, ...moved };
  return path;
}

/**
 * The document form of a routed path: the pin endpoints are dropped, because
 * they are derived from the nodes and would go stale the moment one moves.
 */
export function waypointsFromPath(points: readonly Point[]): Point[] {
  return simplifyPath(points.slice(1, -1));
}

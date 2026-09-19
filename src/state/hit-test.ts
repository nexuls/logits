import {
  GRID_SIZE,
  handlePoint,
  RESIZE_HANDLES,
  type Rect,
  type ResizeHandle,
  rectContains,
  rectsIntersect,
} from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import {
  isEnclosure,
  paintOrder,
  type ResolvedNode,
  type ResolvedPin,
  type ResolvedWire,
  type Scene,
} from "./scene";

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

/** How near a resize handle counts as on it. */
export const RESIZE_HANDLE_HIT_RADIUS = 7;

/**
 * How far in from its outline an enclosure can be grabbed, in world units. A
 * fixed world length rather than a screen one: it is a strip of the drawing,
 * and the header — the grip that matters — scales with it anyway.
 */
export const ENCLOSURE_EDGE = GRID_SIZE / 2;

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
 *
 * A pin is skipped when a node painted above its own covers `world`, so a pin
 * hidden under another body cannot be wired through it. Only the interior
 * covers: two nodes that merely abut still expose each other's edge pins.
 */
export function pinAt(
  scene: Scene,
  world: Point,
  radius = PIN_HIT_RADIUS,
): PinHit | null {
  let best: PinHit | null = null;
  let bestDistance = Infinity;

  const nodeIds = paintOrder(scene);

  // The highest-painted node whose interior covers `world`. Everything below
  // it is hidden at this point, so its pins are out of reach — and the node
  // itself is not, because nothing above *it* covers.
  //
  // One backwards pass rather than asking "is anything above me covering?" per
  // node, which was quadratic: at 2,000 nodes it made a single pointer move
  // cost 37 ms, so hovering ran at 24 moves a second.
  let cover = 0;
  for (let order = nodeIds.length - 1; order >= 0; order--) {
    if (interiorContains(scene.nodes[nodeIds[order]].bounds, world)) {
      cover = order;
      break;
    }
  }

  for (let order = cover; order < nodeIds.length; order++) {
    const node = scene.nodes[nodeIds[order]];
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
 * "Topmost" is the last in `paintOrder`, the order the node layer renders in
 * — so what the user clicks is what they see on top.
 *
 * An enclosure only counts by its header and its edge. Its interior is where
 * the circuit it frames lives, and a press there has to reach that circuit, or
 * start a rubber band on the empty space between its parts.
 */
export function nodeAt(scene: Scene, world: Point): ResolvedNode | null {
  let found: ResolvedNode | null = null;
  for (const nodeId of paintOrder(scene)) {
    const node = scene.nodes[nodeId];
    const hit = isEnclosure(node)
      ? grabsEnclosure(node, world)
      : rectContains(node.bounds, world);
    if (hit) found = node;
  }
  return found;
}

/**
 * Nodes that are *solid* at `world` — every body but an enclosure's, which is
 * painted beneath the wires and so hides none of them.
 */
function solidNodeAt(scene: Scene, world: Point): boolean {
  const node = nodeAt(scene, world);
  return node !== null && !isEnclosure(node);
}

function grabsEnclosure(node: ResolvedNode, world: Point): boolean {
  const { x, y, width, height } = node.bounds;
  if (!rectContains(node.bounds, world)) return false;

  const header =
    (node.def.decoration?.enclosure?.headerCells(node.node.params) ?? 0) *
    GRID_SIZE;

  return (
    world.y <= y + Math.max(header, ENCLOSURE_EDGE) ||
    world.y >= y + height - ENCLOSURE_EDGE ||
    world.x <= x + ENCLOSURE_EDGE ||
    world.x >= x + width - ENCLOSURE_EDGE
  );
}

export type ResizeHit = {
  node: ResolvedNode;
  handle: ResizeHandle;
  spec: NonNullable<NodeDefinition["resize"]>;
};

/**
 * The resize handle nearest `world` within `radius`, or null.
 *
 * Handles exist only while exactly one resizable node is selected, which is
 * when the canvas draws them — a handle nobody can see must not be grabbable.
 * They are checked before bodies, because they sit on the outline where a
 * press would otherwise pick the node up or start a band beside it.
 */
export function resizeHandleAt(
  scene: Scene,
  world: Point,
  selectedNodeIds: readonly string[],
  radius = RESIZE_HANDLE_HIT_RADIUS,
): ResizeHit | null {
  if (selectedNodeIds.length !== 1) return null;
  const node = scene.nodes[selectedNodeIds[0]];
  const spec = node?.def.resize;
  if (!node || !spec) return null;

  let best: ResizeHit | null = null;
  let bestDistance = Infinity;

  // Corners come first in the list and ties keep the earlier entry, so on a
  // box shrunk small enough for handles to overlap the corner wins.
  for (const handle of RESIZE_HANDLES) {
    const point = handlePoint(node.bounds, handle);
    const distance = Math.hypot(point.x - world.x, point.y - world.y);
    if (distance <= radius && distance < bestDistance) {
      best = { node, handle, spec };
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * `nodeIds`, plus everything lying wholly inside any of them that is an
 * enclosure set to carry its contents — what a drag of that selection moves.
 *
 * Computed once when the drag starts, not per frame: a group dragged across
 * the board must not collect every part it passes over.
 */
export function withEnclosedNodes(
  scene: Scene,
  nodeIds: readonly string[],
): string[] {
  const ids = new Set(nodeIds);

  for (const id of nodeIds) {
    const node = scene.nodes[id];
    const enclosure = node?.def.decoration?.enclosure;
    if (!node || !enclosure?.carries(node.node.params)) continue;

    for (const [otherId, other] of Object.entries(scene.nodes)) {
      if (otherId !== id && encloses(node.bounds, other.bounds)) {
        ids.add(otherId);
      }
    }
  }

  return [...ids].sort();
}

/**
 * The wire segment nearest `world` within `radius`, or null.
 *
 * The hit carries the closest point *on* the segment, which is where a bend
 * dropped here would land — so the preview handle the editor draws under the
 * cursor and the waypoint a press actually inserts are the same point, and
 * cannot drift apart (ADR 0007).
 *
 * A point inside a node body misses every wire: the wire layer is painted
 * beneath the nodes, so a wire running under one is not there to be clicked.
 * Enclosures are the exception, painted beneath the wires in turn.
 */
export function wireAt(
  scene: Scene,
  world: Point,
  radius = WIRE_HIT_RADIUS,
): WireHit | null {
  if (solidNodeAt(scene, world)) return null;

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
 * grabbable, or a press near an unselected wire would silently bend it. For
 * the same reason a handle under a node body misses: it is drawn in the wire
 * layer, beneath the node.
 */
export function waypointAt(
  scene: Scene,
  world: Point,
  wireIds: readonly string[],
  radius = WAYPOINT_HIT_RADIUS,
): WaypointHit | null {
  if (solidNodeAt(scene, world)) return null;

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
 *
 * An enclosure is the exception and has to be surrounded: every band drawn
 * inside a group touches it, and a sweep over three gates in one must select
 * the gates, not the box they sit in.
 */
export function elementsInRect(scene: Scene, rect: Rect): RectSelection {
  const nodeIds = Object.keys(scene.nodes)
    .filter((id) => {
      const node = scene.nodes[id];
      return isEnclosure(node)
        ? encloses(rect, node.bounds)
        : rectsIntersect(node.bounds, rect);
    })
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
export function pinsCompatible(a: HasSpec, b: HasSpec): boolean {
  if (a.spec.direction === "inout" || b.spec.direction === "inout") return true;
  return a.spec.direction !== b.spec.direction;
}

/** Same widths, so the connection would raise no diagnostic at all. */
export function pinsMatchExactly(a: HasSpec, b: HasSpec): boolean {
  return pinsCompatible(a, b) && a.spec.width === b.spec.width;
}

/**
 * Only the spec is read, so a caller holding one without a position — the
 * wiring gesture, comparing against the pin a wire started from — need not
 * invent the rest of a `ResolvedPin` to ask.
 */
type HasSpec = Pick<ResolvedPin, "spec">;

/** Does `outer` contain all of `inner`, edges included? */
function encloses(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Does a node painted after `nodeIds[order]` have `world` strictly inside its
 * body? `nodeIds` is `paintOrder`, the same one `nodeAt` walks.
 */
/**
 * Strictly inside, edges excluded — which is what makes two nodes that merely
 * abut still expose each other's edge pins.
 */
function interiorContains(bounds: Rect, world: Point): boolean {
  const { x, y, width, height } = bounds;
  return (
    world.x > x && world.x < x + width && world.y > y && world.y < y + height
  );
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

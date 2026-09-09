import type {
  NodeDefinition,
  NodeLookup,
  NodeParams,
} from "@/lib/nodes/define";
import { clampScale, DEFAULT_SCALE } from "./coords";
import {
  GRID_SIZE,
  nodeBounds,
  pinOffsets,
  rotateSize,
  snapPointToGrid,
  snapToGrid,
} from "./geometry";
import { createNodeId, createWireId } from "./ids";
import {
  type CircuitDocument,
  type CircuitNode,
  isWireAnchor,
  type PinRef,
  type Point,
  type Rotation,
  type Wire,
  type WireAnchor,
  type WireEnd,
} from "./schema";

/**
 * Every mutation the editor can make to a document, as pure functions.
 *
 * They live here, not in the store, so they can be tested without React or a
 * browser and so undo has exactly one shape to record — see
 * artifacts/02-architecture.md. Components never call these directly; they go
 * through `src/state/document.ts`, which is the only thing that owns "the
 * document that is currently open".
 *
 * Two rules hold throughout:
 *
 * 1. **A command that changes nothing returns the document it was given**, by
 *    reference. The store leans on that to skip empty history entries, so an
 *    undo always undoes something the user can see.
 * 2. **Commands reject only the structurally impossible** — a pin that does not
 *    exist, a wire from a pin to itself. A circuit that is merely *wrong*
 *    (mismatched widths, two drivers on a net) is a diagnostic from the
 *    netlist, not a refused edit; see artifacts/03-data-model.md.
 */

export type AddNodeOptions = {
  /** World coordinates. Interpreted as the node's top-left. */
  position: Point;
  rotation?: Rotation;
  /** Merged over the definition's `defaultParams`. */
  params?: NodeParams;
  label?: string;
  /** Grid snapping is the default; the Alt-drag gesture opts out. */
  snap?: boolean;
};

export type AddNodeResult = { document: CircuitDocument; nodeId: string };

export function addNode(
  document: CircuitDocument,
  definition: NodeDefinition,
  options: AddNodeOptions,
): AddNodeResult {
  const { position, rotation, params, label, snap = true } = options;
  const nodeId = createNodeId();

  const node: CircuitNode = {
    id: nodeId,
    type: definition.type,
    position: snap ? snapPointToGrid(position) : position,
    params: { ...definition.defaultParams, ...params },
    ...(rotation ? { rotation } : {}),
    ...(label ? { label } : {}),
  };

  return {
    document: { ...document, nodes: { ...document.nodes, [nodeId]: node } },
    nodeId,
  };
}

/**
 * Where a node's top-left goes for its *centre* to land on `worldCenter` —
 * what placing by click or drop wants, since the cursor is the middle of the
 * thing being placed, not its corner.
 */
export function topLeftForCenter(
  definition: NodeDefinition,
  params: NodeParams,
  rotation: Rotation,
  worldCenter: Point,
): Point {
  const size = rotateSize(definition.size(params), rotation);

  return {
    x: worldCenter.x - (size.width * GRID_SIZE) / 2,
    y: worldCenter.y - (size.height * GRID_SIZE) / 2,
  };
}

/**
 * Moves nodes by a world-space delta.
 *
 * The delta is snapped rather than each node's destination, so a selection
 * keeps its internal spacing even when its members did not start on the grid.
 */
export function moveNodes(
  document: CircuitDocument,
  nodeIds: readonly string[],
  delta: Point,
  options: { snap?: boolean } = {},
): CircuitDocument {
  const { snap = true } = options;
  const dx = snap ? snapToGrid(delta.x) : delta.x;
  const dy = snap ? snapToGrid(delta.y) : delta.y;

  if (dx === 0 && dy === 0) return document;

  const moved = patchNodes(document, nodeIds, (node) => ({
    ...node,
    position: { x: node.position.x + dx, y: node.position.y + dy },
  }));

  return moved;
}

/** Quarter turns, clockwise. Negative turns anticlockwise. */
export function rotateNodes(
  document: CircuitDocument,
  nodeIds: readonly string[],
  quarterTurns = 1,
): CircuitDocument {
  const steps = ((quarterTurns % 4) + 4) % 4;
  if (steps === 0) return document;

  return patchNodes(document, nodeIds, (node) => {
    const rotation = (((node.rotation ?? 0) + steps * 90) % 360) as Rotation;
    const next = { ...node };

    // Absent, not `0`: a node that has never been rotated must serialise the
    // way it did before rotation existed.
    if (rotation === 0) delete next.rotation;
    else next.rotation = rotation;

    return next;
  });
}

/** Merges `patch` into a node's params; `undefined` values remove a key. */
export function setNodeParams(
  document: CircuitDocument,
  nodeId: string,
  patch: Record<string, unknown>,
): CircuitDocument {
  const node = document.nodes[nodeId];
  if (!node) return document;

  const params: NodeParams = { ...node.params };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete params[key];
    else params[key] = value as NodeParams[string];
  }

  return replaceNode(document, { ...node, params });
}

export function setNodeLabel(
  document: CircuitDocument,
  nodeId: string,
  label: string,
): CircuitDocument {
  const node = document.nodes[nodeId];
  if (!node) return document;

  const trimmed = label.trim();
  if ((node.label ?? "") === trimmed) return document;

  const next = { ...node };
  if (trimmed) next.label = trimmed;
  else delete next.label;

  return replaceNode(document, next);
}

export function renameDocument(
  document: CircuitDocument,
  name: string,
): CircuitDocument {
  const trimmed = name.trim();
  if (!trimmed || trimmed === document.name) return document;

  return { ...document, name: trimmed };
}

/**
 * Sets the scale the editor opens this circuit at.
 *
 * `DEFAULT_SCALE` clears the field rather than storing it, so a project reset
 * to 100% serialises identically to one that never set a zoom — the same
 * reason `pinProject` stores `undefined` instead of `false`. Out-of-range
 * values are clamped rather than refused: the control should not be able to
 * produce a scale the canvas will not render, and neither should a caller.
 */
export function setDefaultZoom(
  document: CircuitDocument,
  zoom: number,
): CircuitDocument {
  if (!Number.isFinite(zoom)) return document;

  const clamped = clampScale(zoom);
  const next = clamped === DEFAULT_SCALE ? undefined : clamped;
  if (next === document.defaultZoom) return document;

  const { defaultZoom: _dropped, ...rest } = document;
  return next === undefined ? rest : { ...rest, defaultZoom: next };
}

export type ConnectFailure =
  | "missing-pin"
  | "same-pin"
  | "same-node"
  | "already-connected";

export type ConnectResult =
  | { ok: true; document: CircuitDocument; wireId: string }
  | { ok: false; reason: ConnectFailure };

/**
 * Joins two pins, or a tap on a wire to a pin.
 *
 * `Wire.from` is stored as the driver where the two directions make that
 * unambiguous, so the save format does not depend on which end the user drew
 * first — see artifacts/03-data-model.md. Between two pins of the same
 * direction the drawn order is kept, and the netlist reports the problem. An
 * anchored end is never swapped: only `from` may hold one, and a branch is
 * always drawn away from the wire it taps.
 */
export function connect(
  document: CircuitDocument,
  lookup: NodeLookup,
  a: WireEnd,
  b: PinRef,
  waypoints: readonly Point[] = [],
): ConnectResult {
  const pinB = findPin(document, lookup, b);
  if (!pinB) return { ok: false, reason: "missing-pin" };

  if (isWireAnchor(a)) {
    const tapped = document.wires[a.wireId];
    if (!tapped?.waypoints?.[a.waypoint]) {
      return { ok: false, reason: "missing-pin" };
    }
    if (findWireBetween(document, a, b)) {
      return { ok: false, reason: "already-connected" };
    }

    return addWire(document, a, b, waypoints, false);
  }

  const pinA = findPin(document, lookup, a);

  if (!pinA) return { ok: false, reason: "missing-pin" };
  if (a.nodeId === b.nodeId && a.pinId === b.pinId) {
    return { ok: false, reason: "same-pin" };
  }
  // A node wired to itself is legal in principle (a feedback latch built from
  // one block), but not pin-to-pin on the same node — that is a misdrag.
  if (a.nodeId === b.nodeId) return { ok: false, reason: "same-node" };

  const [from, to] =
    pinB.direction === "out" && pinA.direction !== "out" ? [b, a] : [a, b];

  if (findWireBetween(document, from, to)) {
    return { ok: false, reason: "already-connected" };
  }

  return addWire(document, from, to, waypoints, from !== a);
}

/**
 * Writes the wire. `reversed` says the ends were swapped to put the driver in
 * `from`, so the bends drawn along the way are reversed with them — otherwise
 * the wire would replay its own route backwards.
 */
function addWire(
  document: CircuitDocument,
  from: WireEnd,
  to: PinRef,
  waypoints: readonly Point[],
  reversed: boolean,
): ConnectResult {
  const wireId = createWireId();
  const wire: Wire = { id: wireId, from, to };
  // Bends the user dropped while drawing arrive with the connection rather than
  // as a second edit, so the whole wire is one undo step.
  if (waypoints.length > 0) {
    const ordered = reversed ? [...waypoints].reverse() : waypoints;
    wire.waypoints = ordered.map(snapPointToGrid);
  }

  return {
    ok: true,
    document: { ...document, wires: { ...document.wires, [wireId]: wire } },
    wireId,
  };
}

export type BranchWireResult = {
  document: CircuitDocument;
  /** The bend that was added, as the branch's `from` will name it. */
  anchor: WireAnchor;
  /** Where that bend sits, snapped — where the branch starts drawing. */
  world: Point;
};

/**
 * Taps a wire at `point`, ready for a branch to start there.
 *
 * `slot` is the insertion index into the wire's waypoints, the same meaning
 * `insertWireWaypoint` gives it; the caller gets it from the routed wire's
 * `slots`, the same way a dropped bend does (see `wire-path.ts`).
 *
 * The wire itself is not split and nothing is placed: the tap is an ordinary
 * bend on the wire, and the branch that starts there names it. Dragging that
 * bend therefore drags the start of the branch, because there is only one
 * point and both wires read it.
 */
export function branchWireAt(
  document: CircuitDocument,
  wireId: string,
  slot: number,
  point: Point,
): BranchWireResult | null {
  const wire = document.wires[wireId];
  if (!wire) return null;

  const at = clampIndex(slot, wire.waypoints?.length ?? 0);
  const world = snapPointToGrid(point);

  return {
    document: insertWireWaypoint(document, wireId, at, world),
    anchor: { wireId, waypoint: at },
    world,
  };
}

/** Replaces a wire's bends. An empty list returns the wire to auto-routing. */
export function setWireWaypoints(
  document: CircuitDocument,
  wireId: string,
  waypoints: readonly Point[],
  options: { snap?: boolean } = {},
): CircuitDocument {
  const wire = document.wires[wireId];
  if (!wire) return document;

  const { snap = true } = options;
  const next: Wire = { ...wire };

  if (waypoints.length === 0) delete next.waypoints;
  else next.waypoints = waypoints.map((p) => (snap ? snapPointToGrid(p) : p));

  return { ...document, wires: { ...document.wires, [wireId]: next } };
}

/**
 * Adds a bend at `index` in a wire's list.
 *
 * The index comes from the routed wire's `slots`, which is what keeps a bend
 * dropped on a segment between the two waypoints that segment runs between.
 * An index past the end appends, which is the case for the last segment.
 */
export function insertWireWaypoint(
  document: CircuitDocument,
  wireId: string,
  index: number,
  point: Point,
  options: { snap?: boolean } = {},
): CircuitDocument {
  const wire = document.wires[wireId];
  if (!wire) return document;

  const waypoints = [...(wire.waypoints ?? [])];
  const at = clampIndex(index, waypoints.length);
  waypoints.splice(at, 0, point);

  return reindexAnchors(
    setWireWaypoints(document, wireId, waypoints, options),
    wireId,
    (waypoint) => (waypoint >= at ? waypoint + 1 : waypoint),
  );
}

/** Moves one bend. Out-of-range indices are ignored, not appended. */
export function moveWireWaypoint(
  document: CircuitDocument,
  wireId: string,
  index: number,
  point: Point,
  options: { snap?: boolean } = {},
): CircuitDocument {
  const wire = document.wires[wireId];
  const waypoints = wire?.waypoints;
  if (!waypoints || index < 0 || index >= waypoints.length) return document;

  const next = [...waypoints];
  next[index] = point;

  return setWireWaypoints(document, wireId, next, options);
}

/**
 * Drops one bend. A wire with none left returns to auto-routing, which is what
 * makes "drag a bend onto its neighbour" straighten a wire rather than leaving
 * an invisible kink behind.
 *
 * A bend a branch starts from is **not** dropped: it is the branch's endpoint,
 * and removing it would leave that wire starting nowhere. The gesture that
 * straightens a wire by dropping a bend on its neighbour therefore simply does
 * not straighten this one, which is the honest outcome — the branch is still
 * attached there and the user can see why.
 */
export function removeWireWaypoint(
  document: CircuitDocument,
  wireId: string,
  index: number,
): CircuitDocument {
  const wire = document.wires[wireId];
  const waypoints = wire?.waypoints;
  if (!waypoints || index < 0 || index >= waypoints.length) return document;
  if (hasBranchAt(document, wireId, index)) return document;

  return reindexAnchors(
    setWireWaypoints(
      document,
      wireId,
      waypoints.filter((_, at) => at !== index),
      { snap: false },
    ),
    wireId,
    (waypoint) => (waypoint > index ? waypoint - 1 : waypoint),
  );
}

/** Does any wire start from this bend? */
export function hasBranchAt(
  document: CircuitDocument,
  wireId: string,
  waypoint: number,
): boolean {
  return Object.values(document.wires).some(
    (wire) =>
      isWireAnchor(wire.from) &&
      wire.from.wireId === wireId &&
      wire.from.waypoint === waypoint,
  );
}

/**
 * Shifts the anchors into `wireId` after its bend list changed shape.
 *
 * Waypoints are identified by position, so inserting or removing one moves
 * every bend after it and the branches hanging off them have to move with it.
 * Both callers are here, which is what keeps that rule in one place.
 */
function reindexAnchors(
  document: CircuitDocument,
  wireId: string,
  shift: (waypoint: number) => number,
): CircuitDocument {
  let wires: Record<string, Wire> | null = null;

  for (const [id, wire] of Object.entries(document.wires)) {
    if (!isWireAnchor(wire.from) || wire.from.wireId !== wireId) continue;

    const waypoint = shift(wire.from.waypoint);
    if (waypoint === wire.from.waypoint) continue;

    wires ??= { ...document.wires };
    wires[id] = { ...wire, from: { wireId, waypoint } };
  }

  return wires ? { ...document, wires } : document;
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length, Math.trunc(index)));
}

export type Selection = {
  nodeIds?: readonly string[];
  wireIds?: readonly string[];
};

/**
 * Deletes nodes and wires.
 *
 * Wires attached to a deleted node go with it — leaving them would put a
 * `dangling-wire` in the document, which is a load-time repair case, not
 * something an edit should ever create. Branches off a deleted wire go the
 * same way, and branches off *those*: a tap with nothing left to tap has no
 * position at all, so there is nothing to leave behind for the user to
 * reattach.
 */
export function deleteElements(
  document: CircuitDocument,
  selection: Selection,
): CircuitDocument {
  const nodeIds = new Set(
    (selection.nodeIds ?? []).filter((id) => id in document.nodes),
  );
  const wireIds = new Set(
    (selection.wireIds ?? []).filter((id) => id in document.wires),
  );

  for (const wire of Object.values(document.wires)) {
    const from = isWireAnchor(wire.from) ? null : wire.from.nodeId;
    if ((from && nodeIds.has(from)) || nodeIds.has(wire.to.nodeId)) {
      wireIds.add(wire.id);
    }
  }

  // Repeated until nothing new is caught, so a branch off a branch off a
  // deleted wire goes too. Bounded by the wire count, since each pass either
  // adds a wire or stops.
  for (let added = true; added; ) {
    added = false;
    for (const wire of Object.values(document.wires)) {
      if (wireIds.has(wire.id)) continue;
      if (isWireAnchor(wire.from) && wireIds.has(wire.from.wireId)) {
        wireIds.add(wire.id);
        added = true;
      }
    }
  }

  if (nodeIds.size === 0 && wireIds.size === 0) return document;

  const nodes = omit(document.nodes, nodeIds);
  const wires = omit(document.wires, wireIds);

  return { ...document, nodes, wires };
}

export type Fragment = {
  nodes: readonly CircuitNode[];
  wires: readonly Wire[];
};

export type InsertResult = {
  document: CircuitDocument;
  /** The copies, for the editor to select — never the originals. */
  selection: { nodeIds: string[]; wireIds: string[] };
};

/**
 * Lifts a selection out of the document as standalone data.
 *
 * This, and not a list of ids, is what the clipboard holds: ids would go stale
 * the moment the user cut the elements or opened another circuit, and a
 * fragment can be pasted into a different document entirely.
 *
 * A wire comes along only when *both* its endpoints are in the selection.
 * Copying a half-attached wire would either dangle or silently re-attach to
 * the original, and neither is what "copy these gates" means.
 */
export function extractFragment(
  document: CircuitDocument,
  selection: Selection,
): Fragment {
  const nodeIds = (selection.nodeIds ?? []).filter(
    (id) => id in document.nodes,
  );
  const kept = new Set(nodeIds);

  // Sorted so a fragment is a pure function of the selection, not of the order
  // the user happened to click things in.
  const nodes = [...nodeIds].sort().map((id) => document.nodes[id]);

  const all = Object.values(document.wires).sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const wires = all.filter(
    (wire) =>
      !isWireAnchor(wire.from) &&
      kept.has(wire.from.nodeId) &&
      kept.has(wire.to.nodeId),
  );

  // A branch comes along only if the wire it taps did, for the same reason a
  // wire needs both its nodes: a tap on something that was not copied would
  // re-attach to the original. Repeated so a branch off a branch follows too.
  const taken = new Set(wires.map((wire) => wire.id));
  for (let added = true; added; ) {
    added = false;
    for (const wire of all) {
      if (taken.has(wire.id) || !isWireAnchor(wire.from)) continue;
      if (!taken.has(wire.from.wireId) || !kept.has(wire.to.nodeId)) continue;

      wires.push(wire);
      taken.add(wire.id);
      added = true;
    }
  }

  return { nodes, wires };
}

/**
 * Puts a fragment into the document at a world-space offset, with fresh ids.
 *
 * Paste and duplicate are the same operation — paste supplies the offset from
 * the pointer, duplicate a fixed nudge — which is why there is one function.
 * Ids are opaque and collision-resistant precisely so this cannot clash with
 * what is already there (see `./ids`).
 */
export function insertFragment(
  document: CircuitDocument,
  fragment: Fragment,
  offset: Point,
  options: { snap?: boolean } = {},
): InsertResult {
  if (fragment.nodes.length === 0) {
    return { document, selection: { nodeIds: [], wireIds: [] } };
  }

  const { snap = true } = options;
  const dx = snap ? snapToGrid(offset.x) : offset.x;
  const dy = snap ? snapToGrid(offset.y) : offset.y;

  const nodes = { ...document.nodes };
  const idMap = new Map<string, string>();

  for (const source of fragment.nodes) {
    const nodeId = createNodeId();
    idMap.set(source.id, nodeId);
    nodes[nodeId] = {
      ...source,
      id: nodeId,
      position: { x: source.position.x + dx, y: source.position.y + dy },
      // Params are JSON, so a shallow copy would share a nested value between
      // the copy and the original and let one edit change both.
      params: structuredClone(source.params),
    };
  }

  const wires = { ...document.wires };
  const wireIds: string[] = [];

  // Ids first, then the wires: a branch may be listed before the wire it taps,
  // and its anchor has to name the *copy* of that wire rather than the
  // original it was lifted from.
  const wireIdMap = new Map<string, string>();
  for (const source of fragment.wires) wireIdMap.set(source.id, createWireId());

  for (const source of fragment.wires) {
    const to = idMap.get(source.to.nodeId);
    const from = isWireAnchor(source.from)
      ? anchorInto(wireIdMap, source.from)
      : mappedPin(idMap, source.from);
    if (!from || !to) continue;

    const wireId = wireIdMap.get(source.id);
    if (!wireId) continue;

    wireIds.push(wireId);
    wires[wireId] = {
      id: wireId,
      from,
      to: { nodeId: to, pinId: source.to.pinId },
      ...(source.waypoints
        ? {
            waypoints: source.waypoints.map((point) => ({
              x: point.x + dx,
              y: point.y + dy,
            })),
          }
        : {}),
    };
  }

  return {
    document: { ...document, nodes, wires },
    selection: { nodeIds: [...idMap.values()], wireIds },
  };
}

/** A pin ref pointing at the copy of its node, or null if that was not copied. */
function mappedPin(
  idMap: ReadonlyMap<string, string>,
  ref: PinRef,
): PinRef | null {
  const nodeId = idMap.get(ref.nodeId);
  return nodeId ? { nodeId, pinId: ref.pinId } : null;
}

/** The same for an anchor, re-pointed at the copy of the wire it taps. */
function anchorInto(
  wireIdMap: ReadonlyMap<string, string>,
  anchor: WireAnchor,
): WireAnchor | null {
  const wireId = wireIdMap.get(anchor.wireId);
  return wireId ? { wireId, waypoint: anchor.waypoint } : null;
}

/** World-space box around the nodes of a fragment, for pasting at a point. */
export function fragmentBounds(
  fragment: Fragment,
  lookup: NodeLookup,
): { x: number; y: number; width: number; height: number } | null {
  return boundsOf(
    {
      version: 1,
      id: "fragment",
      name: "fragment",
      nodes: Object.fromEntries(fragment.nodes.map((node) => [node.id, node])),
      wires: {},
    },
    lookup,
    fragment.nodes.map((node) => node.id),
  );
}

/** World-space box around a set of nodes — for "zoom to selection" and tests. */
export function boundsOf(
  document: CircuitDocument,
  lookup: NodeLookup,
  nodeIds: readonly string[],
) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const nodeId of nodeIds) {
    const node = document.nodes[nodeId];
    const definition = lookup(node?.type ?? "");
    if (!node || !definition) continue;

    const size = rotateSize(definition.size(node.params), node.rotation ?? 0);
    const rect = nodeBounds(node.position, size);

    minX = Math.min(minX, rect.x);
    minY = Math.min(minY, rect.y);
    maxX = Math.max(maxX, rect.x + rect.width);
    maxY = Math.max(maxY, rect.y + rect.height);
  }

  if (minX === Infinity) return null;

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function patchNodes(
  document: CircuitDocument,
  nodeIds: readonly string[],
  patch: (node: CircuitNode) => CircuitNode,
): CircuitDocument {
  const nodes = { ...document.nodes };
  let changed = false;

  for (const nodeId of nodeIds) {
    const node = nodes[nodeId];
    if (!node) continue;

    nodes[nodeId] = patch(node);
    changed = true;
  }

  return changed ? { ...document, nodes } : document;
}

function replaceNode(
  document: CircuitDocument,
  node: CircuitNode,
): CircuitDocument {
  return { ...document, nodes: { ...document.nodes, [node.id]: node } };
}

function findPin(document: CircuitDocument, lookup: NodeLookup, ref: PinRef) {
  const node = document.nodes[ref.nodeId];
  if (!node) return undefined;

  return lookup(node.type)
    ?.pins(node.params)
    .find((pin) => pin.id === ref.pinId);
}

function findWireBetween(document: CircuitDocument, a: WireEnd, b: PinRef) {
  return Object.values(document.wires).find(
    (wire) =>
      (sameEnd(wire.from, a) && sameEnd(wire.to, b)) ||
      (sameEnd(wire.from, b) && sameEnd(wire.to, a)),
  );
}

/** Two ends are the same when they are the same kind and name the same thing. */
function sameEnd(a: WireEnd, b: WireEnd): boolean {
  if (isWireAnchor(a) || isWireAnchor(b)) {
    return (
      isWireAnchor(a) &&
      isWireAnchor(b) &&
      a.wireId === b.wireId &&
      a.waypoint === b.waypoint
    );
  }
  return a.nodeId === b.nodeId && a.pinId === b.pinId;
}

function omit<T>(record: Record<string, T>, keys: ReadonlySet<string>) {
  if (keys.size === 0) return record;

  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!keys.has(key)) next[key] = value;
  }
  return next;
}

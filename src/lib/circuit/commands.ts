import type {
  NodeDefinition,
  NodeLookup,
  NodeParams,
} from "@/lib/nodes/define";
import {
  GRID_SIZE,
  nodeBounds,
  rotateSize,
  snapPointToGrid,
  snapToGrid,
} from "./geometry";
import { createNodeId, createWireId } from "./ids";
import type {
  CircuitDocument,
  CircuitNode,
  PinRef,
  Point,
  Rotation,
  Wire,
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

export type ConnectFailure =
  | "missing-pin"
  | "same-pin"
  | "same-node"
  | "already-connected";

export type ConnectResult =
  | { ok: true; document: CircuitDocument; wireId: string }
  | { ok: false; reason: ConnectFailure };

/**
 * Joins two pins.
 *
 * `Wire.from` is stored as the driver where the two directions make that
 * unambiguous, so the save format does not depend on which end the user drew
 * first — see artifacts/03-data-model.md. Between two pins of the same
 * direction the drawn order is kept, and the netlist reports the problem.
 */
export function connect(
  document: CircuitDocument,
  lookup: NodeLookup,
  a: PinRef,
  b: PinRef,
): ConnectResult {
  const pinA = findPin(document, lookup, a);
  const pinB = findPin(document, lookup, b);

  if (!pinA || !pinB) return { ok: false, reason: "missing-pin" };
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

  const wireId = createWireId();
  const wire: Wire = { id: wireId, from, to };

  return {
    ok: true,
    document: { ...document, wires: { ...document.wires, [wireId]: wire } },
    wireId,
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

export type Selection = {
  nodeIds?: readonly string[];
  wireIds?: readonly string[];
};

/**
 * Deletes nodes and wires.
 *
 * Wires attached to a deleted node go with it — leaving them would put a
 * `dangling-wire` in the document, which is a load-time repair case, not
 * something an edit should ever create.
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
    if (nodeIds.has(wire.from.nodeId) || nodeIds.has(wire.to.nodeId)) {
      wireIds.add(wire.id);
    }
  }

  if (nodeIds.size === 0 && wireIds.size === 0) return document;

  const nodes = omit(document.nodes, nodeIds);
  const wires = omit(document.wires, wireIds);

  return { ...document, nodes, wires };
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

function findWireBetween(document: CircuitDocument, a: PinRef, b: PinRef) {
  return Object.values(document.wires).find(
    (wire) =>
      (samePin(wire.from, a) && samePin(wire.to, b)) ||
      (samePin(wire.from, b) && samePin(wire.to, a)),
  );
}

const samePin = (a: PinRef, b: PinRef) =>
  a.nodeId === b.nodeId && a.pinId === b.pinId;

function omit<T>(record: Record<string, T>, keys: ReadonlySet<string>) {
  if (keys.size === 0) return record;

  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!keys.has(key)) next[key] = value;
  }
  return next;
}

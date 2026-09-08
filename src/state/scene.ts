import {
  nodeBounds,
  type PinOffset,
  pinOffsets,
  type Rect,
  rotateSize,
  type Size,
} from "@/lib/circuit/geometry";
import { pinKey } from "@/lib/circuit/netlist";
import type {
  CircuitDocument,
  CircuitNode,
  PinSpec,
  Point,
  Wire,
} from "@/lib/circuit/schema";
import { wirePath } from "@/lib/circuit/wire-path";
import {
  type NodeDefinition,
  type NodeLookup,
  pinSpecsFor,
  placeholderDefinition,
  referencedPinsByNode,
} from "@/lib/nodes/define";

/**
 * The resolved scene: the document with its definitions and geometry already
 * applied, which is what the canvas actually renders.
 *
 * It exists so that registry lookups and coordinate maths happen exactly once,
 * at this boundary, instead of in every component. A node view receives a
 * `ResolvedNode` and draws it; the wire layer reads endpoint world coordinates
 * straight off the pins. Nothing downstream sees a `type` string, so nothing
 * downstream can branch on one.
 *
 * Derived and disposable — never serialised, never written back to the
 * document. See artifacts/decisions/0004-derived-scene-graph.md.
 */

export type ResolvedPin = {
  spec: PinSpec;
  /** Edge the pin sits on after rotation — which way its stub points. */
  side: PinSpec["side"];
  /** World coordinates, node position already added. */
  world: Point;
  /**
   * Net this pin sits on, from the netlist the simulation store owns. Null
   * when the scene was built without one — the scene must not compile a
   * netlist itself, because it is rebuilt on every drag frame and the topology
   * is not.
   */
  netId: number | null;
};

export type ResolvedNode = {
  node: CircuitNode;
  def: NodeDefinition;
  /** True when the registry had no definition for `node.type`. */
  unknownType: boolean;
  /** Grid cells, after rotation. */
  size: Size;
  /** World units, for culling and hit-testing. */
  bounds: Rect;
  pins: ResolvedPin[];
  pinsById: Record<string, ResolvedPin>;
};

export type ResolvedWire = {
  wire: Wire;
  /**
   * Null when the pin no longer exists — e.g. a saved wire lands on `in3` of a
   * gate whose `inputs` param was since lowered to 2. That is a real error and
   * stays visible rather than being papered over.
   */
  from: ResolvedPin | null;
  to: ResolvedPin | null;
  /**
   * The polyline to draw, pin endpoints included. Empty when either
   * endpoint is missing — there is nothing to route between.
   */
  points: Point[];
  /**
   * Per segment, the index a bend dropped on it takes in `wire.waypoints`.
   * What lets a click on the wire insert a waypoint in the right place
   * without the editor re-deriving the routing (ADR 0007).
   */
  slots: number[];
};

export type Scene = {
  nodes: Record<string, ResolvedNode>;
  wires: Record<string, ResolvedWire>;
};

type NodeLayout = { size: Size; offsets: PinOffset[] };

/**
 * Layout keyed by everything it depends on — and `position` is not one of
 * those, which is the point: a drag re-uses the entry it already has, and two
 * identical AND gates share one. Bounded by the number of distinct
 * (type, params, rotation) combinations in play, which stays small.
 */
const layoutCache = new Map<string, NodeLayout>();

/**
 * Commands replace the node object on every edit, so object identity is an
 * exact "has this node changed?" test — and entries evict themselves when the
 * node is deleted, with no dirty flags to keep in sync.
 *
 * The entry remembers which `pinToNet` it was resolved against, because net
 * ids are the one part of a `ResolvedNode` that can change without the node
 * changing: recompiling the netlist renumbers nets under an untouched gate.
 */
const resolvedCache = new WeakMap<
  CircuitNode,
  { pinToNet: PinToNet | undefined; resolved: ResolvedNode }
>();

/** `pinKey(nodeId, pinId)` → net id, as `buildNetlist` produces it. */
type PinToNet = Record<string, number>;

export function buildScene(
  document: CircuitDocument,
  lookup: NodeLookup,
  pinToNet?: PinToNet,
): Scene {
  const referencedPins = referencedPinsByNode(document);

  const nodes: Record<string, ResolvedNode> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    nodes[id] = resolveNode(node, lookup, referencedPins.get(id), pinToNet);
  }

  const wires: Record<string, ResolvedWire> = {};
  for (const [id, wire] of Object.entries(document.wires)) {
    const from = nodes[wire.from.nodeId]?.pinsById[wire.from.pinId] ?? null;
    const to = nodes[wire.to.nodeId]?.pinsById[wire.to.pinId] ?? null;
    const routed =
      from && to
        ? wirePath(from.world, from.side, to.world, to.side, wire.waypoints)
        : { points: [], slots: [] };

    wires[id] = { wire, from, to, ...routed };
  }

  return { nodes, wires };
}

export function resolveNode(
  node: CircuitNode,
  lookup: NodeLookup,
  referencedPins?: readonly string[],
  pinToNet?: PinToNet,
): ResolvedNode {
  const definition = lookup(node.type);

  // A placeholder's pins come from the wires rather than from params, so its
  // layout is not a function of the node alone and must not be identity-cached.
  if (definition) {
    const hit = resolvedCache.get(node);
    if (hit && hit.pinToNet === pinToNet) return hit.resolved;
  }

  const def = definition ?? placeholderDefinition(node.type);
  const specs = pinSpecsFor(node, lookup, referencedPins);

  const rotation = node.rotation ?? 0;
  const key = definition
    ? `${node.type}|${rotation}|${stableStringify(node.params)}`
    : `?${node.type}|${rotation}|${(referencedPins ?? []).join(",")}`;

  let layout = layoutCache.get(key);
  if (!layout) {
    const size = def.size(node.params);
    layout = {
      size: rotateSize(size, rotation),
      offsets: pinOffsets(specs, size, rotation),
    };
    layoutCache.set(key, layout);
  }

  const pins: ResolvedPin[] = layout.offsets.map((offset) => ({
    spec: offset.spec,
    side: offset.side,
    world: { x: node.position.x + offset.dx, y: node.position.y + offset.dy },
    netId: pinToNet?.[pinKey(node.id, offset.spec.id)] ?? null,
  }));

  const pinsById: Record<string, ResolvedPin> = {};
  for (const pin of pins) pinsById[pin.spec.id] = pin;

  const resolved: ResolvedNode = {
    node,
    def,
    unknownType: definition === undefined,
    size: layout.size,
    bounds: nodeBounds(node.position, layout.size),
    pins,
    pinsById,
  };

  if (definition) resolvedCache.set(node, { pinToNet, resolved });
  return resolved;
}

/**
 * Key-sorted so `{a:1,b:2}` and `{b:2,a:1}` share a cache entry. Plain `<`
 * rather than `localeCompare`, which is locale-dependent and would make the
 * key non-deterministic across machines.
 */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}

/** Test seam — the caches are process-global and otherwise never cleared. */
export function clearSceneCaches(): void {
  layoutCache.clear();
}

import {
  nodeBounds,
  type PinOffset,
  pinOffsets,
  type Rect,
  rotateSize,
  type Size,
} from "@/lib/circuit/geometry";
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
  placeholderDefinition,
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
  /** Filled in by `buildNetlist` once it lands; null until then. */
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
   * The Manhattan polyline to draw, pin endpoints included. Empty when either
   * endpoint is missing — there is nothing to route between.
   */
  points: Point[];
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
 */
const resolvedCache = new WeakMap<CircuitNode, ResolvedNode>();

export function buildScene(
  document: CircuitDocument,
  lookup: NodeLookup,
): Scene {
  const referencedPins = collectReferencedPins(document);

  const nodes: Record<string, ResolvedNode> = {};
  for (const [id, node] of Object.entries(document.nodes)) {
    nodes[id] = resolveNode(node, lookup, referencedPins.get(id));
  }

  const wires: Record<string, ResolvedWire> = {};
  for (const [id, wire] of Object.entries(document.wires)) {
    const from = nodes[wire.from.nodeId]?.pinsById[wire.from.pinId] ?? null;
    const to = nodes[wire.to.nodeId]?.pinsById[wire.to.pinId] ?? null;
    wires[id] = {
      wire,
      from,
      to,
      points:
        from && to
          ? wirePath(from.world, from.side, to.world, to.side, wire.waypoints)
          : [],
    };
  }

  return { nodes, wires };
}

export function resolveNode(
  node: CircuitNode,
  lookup: NodeLookup,
  referencedPins?: readonly string[],
): ResolvedNode {
  const definition = lookup(node.type);

  // A placeholder's pins come from the wires rather than from params, so its
  // layout is not a function of the node alone and must not be identity-cached.
  if (definition) {
    const hit = resolvedCache.get(node);
    if (hit) return hit;
  }

  const def = definition ?? placeholderDefinition(node.type);
  const specs = definition
    ? def.pins(node.params)
    : synthesizePins(referencedPins ?? []);

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
    netId: null,
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

  if (definition) resolvedCache.set(node, resolved);
  return resolved;
}

/** Which pin ids each node is wired to — the only clue a placeholder has. */
function collectReferencedPins(
  document: CircuitDocument,
): Map<string, string[]> {
  const byNode = new Map<string, string[]>();
  for (const wire of Object.values(document.wires)) {
    for (const ref of [wire.from, wire.to]) {
      const pins = byNode.get(ref.nodeId);
      if (!pins) byNode.set(ref.nodeId, [ref.pinId]);
      else if (!pins.includes(ref.pinId)) pins.push(ref.pinId);
    }
  }
  // Sorted so a placeholder's pin order does not depend on wire iteration order.
  for (const pins of byNode.values()) pins.sort();
  return byNode;
}

/** Reconstructs a plausible left-side pin strip for an unknown node type. */
function synthesizePins(pinIds: readonly string[]): PinSpec[] {
  return pinIds.map((id, index) => ({
    id,
    name: id,
    direction: "inout" as const,
    width: 1,
    side: "left" as const,
    offset: index + 1,
  }));
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

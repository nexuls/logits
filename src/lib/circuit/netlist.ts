import {
  type NodeLookup,
  pinSpecsFor,
  referencedPinsByNode,
} from "@/lib/nodes/define";
import type { CircuitDocument, PinRef, PinSpec } from "./schema";

/**
 * Netlist compilation: the document flattened into the form the engine runs.
 *
 * Pure, and it must stay that way — it is the easiest thing in the codebase to
 * test. No map iteration order leaks into the output: node, wire and pin keys
 * are sorted before anything is assigned an index, so the same document always
 * compiles to the same net numbering however the document was built up.
 * See artifacts/03-data-model.md.
 *
 * Nothing here is stored. The netlist is rebuilt from the document whenever the
 * topology changes; positions and waypoints do not affect it.
 */

/** Dense index into `Netlist.nets`, so the engine can use typed arrays. */
export type NetId = number;

export type NetlistPin = {
  nodeId: string;
  pinId: string;
  direction: PinSpec["direction"];
  width: number;
  /** May drive `Z`, so it can share a net with other drivers legitimately. */
  tristate: boolean;
};

export type Net = {
  id: NetId;
  /**
   * The widest pin on the net. On a `width-mismatch` the net is still built —
   * diagnostics are data, not exceptions — and taking the widest means no
   * driver can write past the end of the engine's buffer for it.
   */
  width: number;
  /** Output and inout pins. */
  drivers: NetlistPin[];
  /** Input and inout pins — who is re-evaluated when the net changes. */
  readers: NetlistPin[];
};

export type NetlistNode = {
  id: string;
  type: string;
  params: CircuitDocument["nodes"][string]["params"];
  pins: PinSpec[];
  /** Net each of this node's pins sits on, by pin id. */
  pinNets: Record<string, NetId>;
};

export type DiagnosticCode =
  | "width-mismatch"
  | "multiple-drivers"
  | "undriven-input"
  | "unknown-node-type"
  | "unknown-pin"
  | "oscillation";

export type Diagnostic = {
  code: DiagnosticCode;
  severity: "error" | "warning";
  message: string;
  /** Elements the editor should mark. */
  nodeIds?: readonly string[];
  wireIds?: readonly string[];
  pins?: readonly PinRef[];
  netId?: NetId;
};

export type Netlist = {
  nets: Net[];
  nodes: NetlistNode[];
  /** Keyed by `pinKey`, because a `PinRef` object is not a usable map key. */
  pinToNet: Record<string, NetId>;
  /** `netToReaders[netId]` — the engine's hot path, so it is an array. */
  netToReaders: NetlistPin[][];
  diagnostics: Diagnostic[];
};

/**
 * Ids and pin ids are arbitrary strings, so the separator has to be a byte
 * neither can contain rather than something merely unlikely like `":"`.
 */
export function pinKey(nodeId: string, pinId: string): string {
  return `${nodeId}\u0000${pinId}`;
}

export function buildNetlist(
  document: CircuitDocument,
  lookup: NodeLookup,
): Netlist {
  const diagnostics: Diagnostic[] = [];
  const referencedPins = referencedPinsByNode(document);

  // Sorted rather than in document order: net ids reach the engine, and two
  // copies of one circuit built by different edit sequences must compile the
  // same way.
  const nodeIds = Object.keys(document.nodes).sort();
  const wireIds = Object.keys(document.wires).sort();

  const pins = new Map<string, NetlistPin>();
  const nodes: NetlistNode[] = [];

  for (const nodeId of nodeIds) {
    const node = document.nodes[nodeId];
    if (!lookup(node.type)) {
      diagnostics.push({
        code: "unknown-node-type",
        severity: "error",
        message: `No definition for node type "${node.type}"; it cannot be simulated.`,
        nodeIds: [nodeId],
      });
    }

    // An unknown type keeps the pins its wires reference, so the nets around
    // it still form and the rest of the circuit compiles.
    const specs = pinSpecsFor(node, lookup, referencedPins.get(nodeId));
    for (const spec of specs) {
      pins.set(pinKey(nodeId, spec.id), {
        nodeId,
        pinId: spec.id,
        direction: spec.direction,
        width: spec.width,
        tristate: spec.tristate ?? spec.direction === "inout",
      });
    }

    nodes.push({
      id: nodeId,
      type: node.type,
      params: node.params,
      pins: specs,
      pinNets: {},
    });
  }

  const union = new UnionFind(pins.keys());

  for (const wireId of wireIds) {
    const wire = document.wires[wireId];
    const fromKey = pinKey(wire.from.nodeId, wire.from.pinId);
    const toKey = pinKey(wire.to.nodeId, wire.to.pinId);
    const from = pins.get(fromKey);
    const to = pins.get(toKey);

    if (!from || !to) {
      // The pin existed when the wire was drawn and does not now — an `inputs`
      // param lowered, a node type replaced. Load-time `dangling-wire` catches
      // only a missing *node*, so this is what catches the rest.
      diagnostics.push({
        code: "unknown-pin",
        severity: "error",
        message: "Wire connects a pin that no longer exists.",
        wireIds: [wireId],
        pins: [from ? wire.to : wire.from],
      });
      continue;
    }

    // Every wire on a net joins equal widths if and only if the whole net
    // does, so checking per wire is equivalent to checking per net and blames
    // the exact wire the user has to fix.
    if (from.width !== to.width) {
      diagnostics.push({
        code: "width-mismatch",
        severity: "error",
        message: `Wire joins a ${from.width}-bit pin to a ${to.width}-bit pin.`,
        wireIds: [wireId],
        pins: [wire.from, wire.to],
        nodeIds: dedupe([wire.from.nodeId, wire.to.nodeId]),
      });
    }

    union.merge(fromKey, toKey);
  }

  // Roots are numbered in sorted-key order, so net ids are stable. Every pin
  // gets a net, wired or not: an unconnected input still has to read Z.
  const netIdByRoot = new Map<string, NetId>();
  const nets: Net[] = [];
  const pinToNet: Record<string, NetId> = {};

  for (const key of [...pins.keys()].sort()) {
    const root = union.find(key);
    let netId = netIdByRoot.get(root);
    if (netId === undefined) {
      netId = nets.length;
      netIdByRoot.set(root, netId);
      nets.push({ id: netId, width: 1, drivers: [], readers: [] });
    }

    const pin = pins.get(key) as NetlistPin;
    const net = nets[netId];
    net.width = Math.max(net.width, pin.width);
    if (pin.direction !== "in") net.drivers.push(pin);
    if (pin.direction !== "out") net.readers.push(pin);
    pinToNet[key] = netId;
  }

  for (const node of nodes) {
    for (const spec of node.pins) {
      node.pinNets[spec.id] = pinToNet[pinKey(node.id, spec.id)];
    }
  }

  for (const net of nets) {
    const hard = net.drivers.filter((pin) => !pin.tristate);
    if (hard.length > 1) {
      diagnostics.push({
        code: "multiple-drivers",
        severity: "error",
        message: `${hard.length} outputs drive one net; it resolves to X.`,
        netId: net.id,
        pins: hard.map(toPinRef),
        nodeIds: dedupe(hard.map((pin) => pin.nodeId)),
      });
    }

    // A net with neither drivers nor readers is an unwired output, which is
    // not worth a word. One with readers is an input floating at Z.
    if (net.drivers.length === 0 && net.readers.length > 0) {
      diagnostics.push({
        code: "undriven-input",
        severity: "warning",
        message: "Input is not driven; it reads Z.",
        netId: net.id,
        pins: net.readers.map(toPinRef),
        nodeIds: dedupe(net.readers.map((pin) => pin.nodeId)),
      });
    }
  }

  return {
    nets,
    nodes,
    pinToNet,
    netToReaders: nets.map((net) => net.readers),
    diagnostics,
  };
}

const toPinRef = (pin: NetlistPin): PinRef => ({
  nodeId: pin.nodeId,
  pinId: pin.pinId,
});

const dedupe = (values: readonly string[]): string[] => [...new Set(values)];

/**
 * Union-find with path compression and union by size. Keyed by string because
 * the caller's identities are pin keys; the dense indices the engine wants are
 * assigned afterwards, from sorted keys.
 */
class UnionFind {
  private readonly parent = new Map<string, string>();
  private readonly size = new Map<string, number>();

  constructor(keys: Iterable<string>) {
    for (const key of keys) {
      this.parent.set(key, key);
      this.size.set(key, 1);
    }
  }

  find(key: string): string {
    let root = key;
    while (this.parent.get(root) !== root) {
      root = this.parent.get(root) as string;
    }
    let walk = key;
    while (walk !== root) {
      const next = this.parent.get(walk) as string;
      this.parent.set(walk, root);
      walk = next;
    }
    return root;
  }

  merge(a: string, b: string): void {
    let rootA = this.find(a);
    let rootB = this.find(b);
    if (rootA === rootB) return;
    // Smaller tree under larger keeps find() near-constant. On a tie the
    // lexicographically smaller key wins, so the shape of the forest never
    // depends on the order the wires arrived in.
    const sizeA = this.size.get(rootA) as number;
    const sizeB = this.size.get(rootB) as number;
    if (sizeA < sizeB || (sizeA === sizeB && rootB < rootA)) {
      [rootA, rootB] = [rootB, rootA];
    }
    this.parent.set(rootB, rootA);
    this.size.set(rootA, sizeA + sizeB);
  }
}

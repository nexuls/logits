import { buildNetlist, pinKey } from "@/lib/circuit/netlist";
import type { CircuitDocument, CircuitNode } from "@/lib/circuit/schema";
import type { EvalContext, NodeParams, NodeState } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal, parseSignal, type Signal } from "@/lib/sim/logic";

/**
 * Test support shared by the node families added in phase 4. **Not app code**
 * — it lives outside `src/lib/` precisely so nothing in the domain layer can
 * import it.
 *
 * Two harnesses, because the catalog needs two kinds of test (see the
 * checklist in artifacts/05-node-authoring-guide.md):
 *
 * - `evaluateOnce` runs one `evaluate` against fixed inputs, which is what a
 *   truth table wants, including the `X` and `Z` rows a two-valued table
 *   cannot express.
 * - `engineFor` builds a real circuit and runs it, which is the only way to
 *   test a node whose behaviour is a *waveform*: a flip-flop, a clock, a
 *   counter. Anything with `state` is tested this way.
 */

export type Spec = { type: string; params?: NodeParams };
/** `[fromNode, fromPin, toNode, toPin]`. */
export type Edge = [string, string, string, string];

export function circuit(
  nodes: Record<string, Spec>,
  wires: readonly Edge[] = [],
): CircuitDocument {
  const entries = Object.entries(nodes).map(
    ([id, spec]): [string, CircuitNode] => {
      const definition = lookupNode(spec.type);
      if (!definition) throw new Error(`${spec.type} is not in the registry`);
      return [
        id,
        {
          id,
          type: spec.type,
          position: { x: 0, y: 0 },
          params: { ...definition.defaultParams, ...spec.params },
        },
      ];
    },
  );

  return {
    version: 2,
    id: "d_test",
    name: "Test",
    nodes: Object.fromEntries(entries),
    wires: Object.fromEntries(
      wires.map(([fromNode, fromPin, toNode, toPin], index) => {
        const id = `w${index}`;
        return [
          id,
          {
            id,
            from: { nodeId: fromNode, pinId: fromPin },
            to: { nodeId: toNode, pinId: toPin },
          },
        ];
      }),
    ),
  };
}

export type Harness = {
  engine: Engine;
  /** The value on a pin, MSB first. */
  at: (nodeId: string, pinId: string) => string;
  netOf: (nodeId: string, pinId: string) => number;
  /** Advances `ns` of simulated time from wherever the engine is now. */
  run: (ns: number) => void;
  /** New params for one node, effective immediately — a switch being flipped. */
  set: (nodeId: string, params: NodeParams) => void;
};

export function engineFor(
  nodes: Record<string, Spec>,
  wires: readonly Edge[] = [],
): Harness {
  const document = circuit(nodes, wires);
  const netlist = buildNetlist(document, lookupNode);
  const engine = new Engine(netlist, lookupNode);

  return {
    engine,
    at: (nodeId, pinId) => formatSignal(engine.readPin(nodeId, pinId)),
    netOf: (nodeId, pinId) => netlist.pinToNet[pinKey(nodeId, pinId)],
    run: (ns) => {
      engine.runUntil(engine.now + ns);
    },
    set: (nodeId, params) => {
      const node = document.nodes[nodeId];
      engine.setNodeParams(nodeId, { ...node.params, ...params });
    },
  };
}

export type Writes = Record<string, { value: string; delayNs: number }>;

export type EvaluateOptions = {
  /** Carried between calls to test a node that remembers something. */
  state?: NodeState;
  now?: number;
  /** Collects `scheduleSelf` requests, which is how a clock is tested. */
  scheduled?: number[];
  samples?: { channel: string; value: string }[];
};

/**
 * Runs one `evaluate` against fixed inputs. `inputs` maps pin id to a signal
 * written MSB-first; a pin the case does not mention is unconnected and reads
 * `Z`, exactly as it would in a circuit.
 */
export function evaluateOnce(
  type: string,
  inputs: Record<string, string>,
  params: NodeParams = {},
  options: EvaluateOptions = {},
): Writes {
  const definition = lookupNode(type);
  if (!definition?.evaluate) throw new Error(`${type} has no evaluate`);

  const merged = { ...definition.defaultParams, ...params };
  const pins = definition.pins(merged);
  const writes: Writes = {};
  const now = options.now ?? 0;

  const context: EvalContext = {
    now,
    params: merged,
    state: options.state ?? definition.createState?.(merged) ?? {},
    read: (pinId) => {
      const spec = pins.find((pin) => pin.id === pinId);
      if (!spec) throw new Error(`${type} has no pin "${pinId}"`);
      return parseSignal(inputs[pinId] ?? "Z".repeat(spec.width));
    },
    write: (pinId, value: Signal, delayNs = 0) => {
      writes[pinId] = { value: formatSignal(value), delayNs };
    },
    scheduleSelf: (delayNs) => {
      options.scheduled?.push(delayNs);
    },
    emitSample: (channel, value) => {
      options.samples?.push({ channel, value: formatSignal(value) });
    },
  };

  definition.evaluate(context);
  return writes;
}

/** The value written to one pin, or undefined when the node did not write it. */
export function outputOf(
  type: string,
  inputs: Record<string, string>,
  pinId = "out",
  params?: NodeParams,
): string | undefined {
  return evaluateOnce(type, inputs, params)[pinId]?.value;
}

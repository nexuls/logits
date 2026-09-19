import { writeFileSync } from "node:fs";

/**
 * Generates a synthetic board at the scale artifacts/01-product-spec.md sets
 * as the target, for the performance pass.
 *
 * A grid of inverter chains, not a random graph: every node is wired, the
 * netlist has as many nets as nodes, and the layout is spread widely enough
 * that no single screen holds more than a fraction of it — which is the case
 * culling and a spatial index are supposed to help with. Deterministic, so two
 * runs measure the same board.
 *
 *   bench-circuit.ts <out.json> [nodeCount]
 */

const [out, count = "2000"] = process.argv.slice(2);
if (!out) {
  console.error("usage: bench-circuit.ts <out.json> [nodeCount]");
  process.exit(2);
}

const total = Number(count);
/** Inverters per chain; a chain is one net per link plus a switch driving it. */
const CHAIN = 20;
const COLUMN_PITCH = 100;
const ROW_PITCH = 60;
const ORIGIN = { x: 80, y: 120 };

type Node = Record<string, unknown>;
const nodes: Record<string, Node> = {};
const wires: Record<string, Node> = {};

const chains = Math.ceil(total / CHAIN);
let made = 0;

for (let chain = 0; chain < chains && made < total; chain++) {
  const y = ORIGIN.y + chain * ROW_PITCH;
  let previous: { id: string; pin: string } | null = null;

  for (let step = 0; step < CHAIN && made < total; step++, made++) {
    const id = `n${chain}_${step}`;
    const x = ORIGIN.x + step * COLUMN_PITCH;

    // The head of each chain is a switch, so the chain has a driver and the
    // netlist reports no undriven inputs.
    if (step === 0) {
      nodes[id] = {
        id,
        type: "io.switch",
        position: { x, y },
        label: `S${chain}`,
        params: { value: 0, width: 1 },
      };
      previous = { id, pin: "out" };
      continue;
    }

    nodes[id] = {
      id,
      type: "gate.not",
      position: { x, y },
      params: { width: 1 },
    };

    if (previous) {
      wires[`w_${id}`] = {
        id: `w_${id}`,
        from: { nodeId: previous.id, pinId: previous.pin },
        to: { nodeId: id, pinId: "in" },
      };
    }
    previous = { id, pin: "out" };
  }
}

writeFileSync(
  out,
  JSON.stringify({
    version: 4,
    id: `d_bench${total}`,
    name: `Bench ${total}`,
    nodes,
    wires,
    defaultZoom: 0.6,
  }),
);
console.log(
  `${out}: ${Object.keys(nodes).length} nodes, ${Object.keys(wires).length} wires`,
);

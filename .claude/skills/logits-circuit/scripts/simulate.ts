import { readFileSync } from "node:fs";
import { fromJson } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import type { CircuitDocument, CircuitNode } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import type { NodeLookup, NodeParams } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal } from "@/lib/sim/logic";

/**
 * Runs a circuit file in the real engine, headless — the fast logic check to
 * do before looking at it in the browser.
 *
 *   simulate.ts <circuit.json>                           settle, print labelled parts
 *   simulate.ts <circuit.json> --truth A,B --watch Sum   exhaustive truth table
 *   simulate.ts <circuit.json> --steps steps.json        ordered steps with expectations
 *
 * Nodes are named by `label` (or id). `Label` alone means its `value` param
 * when setting and its only / input pin when reading; `Label.pin` or
 * `Label.param` picks one. The steps file is the one the Playwright spec
 * replays in the browser.
 */

export type Step = {
  name?: string;
  /** `{ "A": 1, "Clock.en": 0, "Mode.value": 5 }` */
  set?: Record<string, number | boolean | string>;
  /** Simulated ns to advance after `set`. Default 50. */
  runNs?: number;
  /** `{ "Sum": "1", "Count": 5, "Reg.q": "0101" }` — bits MSB first, or a decimal. */
  expect?: Record<string, number | string>;
};

const args = process.argv.slice(2);
const file = args.find(
  (arg, i) => !arg.startsWith("--") && !args[i - 1]?.startsWith("--"),
);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? args[index + 1] : undefined;
};
if (!file) {
  console.error(
    "usage: simulate.ts <circuit.json> [--truth A,B --watch X,Y] [--steps steps.json] [--settle ns]",
  );
  process.exit(2);
}

const loaded = fromJson(JSON.parse(readFileSync(file, "utf8")));
if (!loaded.ok || loaded.issues.length > 0) {
  console.error("load issues:", JSON.stringify(loaded.issues, null, 2));
  process.exit(1);
}
const base = loaded.document;
const lookup: NodeLookup = subcircuitLookup(base, lookupNode);
const settleNs = Number(flag("settle") ?? 50);

function findNode(doc: CircuitDocument, name: string): CircuitNode {
  const byId = doc.nodes[name];
  if (byId) return byId;
  const matches = Object.values(doc.nodes).filter(
    (n) => n.label === name && !lookup(n.type)?.decoration,
  );
  if (matches.length === 1) return matches[0];
  throw new Error(
    matches.length === 0
      ? `no node with id or label "${name}"`
      : `label "${name}" is on ${matches.length} nodes (${matches.map((m) => m.id).join(", ")}); use an id`,
  );
}

/** `Label` / `Label.part`, where the label itself may contain dots. */
function splitRef(
  doc: CircuitDocument,
  ref: string,
): { node: CircuitNode; part?: string } {
  try {
    return { node: findNode(doc, ref) };
  } catch (error) {
    const dot = ref.lastIndexOf(".");
    if (dot <= 0) throw error;
    return { node: findNode(doc, ref.slice(0, dot)), part: ref.slice(dot + 1) };
  }
}

function paramPatch(
  doc: CircuitDocument,
  ref: string,
  value: unknown,
): [string, NodeParams] {
  const { node, part } = splitRef(doc, ref);
  const key = part ?? "value";
  const coerced =
    typeof value === "boolean" && key === "value" ? Number(value) : value;
  return [node.id, { [key]: coerced } as NodeParams];
}

function pinFor(
  doc: CircuitDocument,
  ref: string,
): { nodeId: string; pinId: string; label: string } {
  const { node, part } = splitRef(doc, ref);
  const def = lookup(node.type);
  const pins = def?.pins(node.params) ?? [];
  if (part) {
    if (!pins.some((p) => p.id === part)) {
      throw new Error(
        `${ref}: ${node.type} has pins ${pins.map((p) => p.id).join(", ")}`,
      );
    }
    return { nodeId: node.id, pinId: part, label: ref };
  }
  const pick =
    pins.length === 1
      ? pins[0]
      : (pins.find((p) => p.id === "in") ??
        pins.find((p) => p.direction === "in"));
  if (!pick || pins.filter((p) => p.direction === "in").length > 1) {
    throw new Error(
      `${ref}: ambiguous, name a pin — ${pins.map((p) => p.id).join(", ")}`,
    );
  }
  return { nodeId: node.id, pinId: pick.id, label: ref };
}

function build(doc: CircuitDocument) {
  const netlist = buildNetlist(doc, lookup);
  for (const d of netlist.diagnostics.filter((x) => x.severity === "error")) {
    console.error(`netlist error ${d.code}: ${d.message}`);
  }
  return new Engine(netlist, lookup);
}

function show(bits: string): string {
  return /^[01]+$/.test(bits) && bits.length > 1
    ? `${bits} (${Number.parseInt(bits, 2)})`
    : bits;
}

function matches(actual: string, expected: number | string): boolean {
  if (typeof expected === "number")
    return /^[01]+$/.test(actual) && Number.parseInt(actual, 2) === expected;
  return actual === expected.replace(/[\s_]/g, "");
}

function withParams(
  doc: CircuitDocument,
  patches: [string, NodeParams][],
): CircuitDocument {
  const nodes = { ...doc.nodes };
  for (const [id, patch] of patches) {
    nodes[id] = { ...nodes[id], params: { ...nodes[id].params, ...patch } };
  }
  return { ...doc, nodes };
}

const truth = flag("truth");
const stepsFile = flag("steps");

if (truth) {
  const inputs = truth.split(",").map((name) => findNode(base, name.trim()));
  const watch = (flag("watch") ?? "")
    .split(",")
    .filter(Boolean)
    .map((ref) => pinFor(base, ref.trim()));
  if (watch.length === 0) throw new Error("--truth needs --watch Out1,Out2");
  const widths = inputs.map((n) => Number(n.params.width ?? 1));
  const totalBits = widths.reduce((a, b) => a + b, 0);
  if (totalBits > 16)
    throw new Error(
      `${totalBits} input bits is too many rows; test with --steps`,
    );

  const header = [
    ...inputs.map((n) => n.label ?? n.id),
    "|",
    ...watch.map((w) => w.label),
  ];
  console.log(header.join("\t"));
  let unknownRows = 0;
  for (let row = 0; row < 2 ** totalBits; row++) {
    let shift = totalBits;
    const values = widths.map((w) => {
      shift -= w;
      return (row >> shift) & ((1 << w) - 1);
    });
    const doc = withParams(
      base,
      inputs.map((n, i) => [n.id, { value: values[i] }]),
    );
    const engine = build(doc);
    const result = engine.runUntil(settleNs);
    const outs = watch.map((w) =>
      formatSignal(engine.readPin(w.nodeId, w.pinId)),
    );
    if (outs.some((o) => /[XZ]/.test(o)) || result.oscillating) unknownRows++;
    console.log(
      [
        ...values.map(String),
        "|",
        ...outs.map(show),
        result.oscillating ? "OSCILLATING" : "",
      ]
        .join("\t")
        .trimEnd(),
    );
  }
  if (unknownRows > 0) {
    console.log(`\n${unknownRows} row(s) with X/Z or oscillation`);
    process.exit(1);
  }
  process.exit(0);
}

if (stepsFile) {
  const steps: Step[] = JSON.parse(readFileSync(stepsFile, "utf8"));
  const engine = build(base);
  const params = new Map(
    Object.values(base.nodes).map((n) => [n.id, n.params]),
  );
  let failures = 0;
  for (const [index, step] of steps.entries()) {
    for (const [ref, value] of Object.entries(step.set ?? {})) {
      const [id, patch] = paramPatch(base, ref, value);
      const next = { ...params.get(id), ...patch };
      params.set(id, next);
      engine.setNodeParams(id, next);
    }
    const result = engine.runUntil(engine.now + (step.runNs ?? settleNs));
    console.log(
      `step ${index + 1}${step.name ? ` "${step.name}"` : ""} @ ${engine.now} ns${result.oscillating ? " OSCILLATING" : ""}`,
    );
    if (result.oscillating) failures++;
    for (const [ref, expected] of Object.entries(step.expect ?? {})) {
      const pin = pinFor(base, ref);
      const actual = formatSignal(engine.readPin(pin.nodeId, pin.pinId));
      const ok = matches(actual, expected);
      if (!ok) failures++;
      console.log(
        `  ${ok ? "ok  " : "FAIL"} ${ref} = ${show(actual)}${ok ? "" : `, expected ${expected}`}`,
      );
    }
  }
  console.log(failures > 0 ? `\n${failures} failure(s)` : "\nall steps pass");
  process.exit(failures > 0 ? 1 : 0);
}

// No mode: settle and print every labelled part's pins.
const engine = build(base);
const result = engine.runUntil(settleNs);
console.log(
  `settled to ${engine.now} ns${result.oscillating ? " — OSCILLATING" : ""}`,
);
for (const node of Object.values(base.nodes)) {
  const def = lookup(node.type);
  if (!node.label || !def || def.decoration) continue;
  const pins = def
    .pins(node.params)
    .map((p) => `${p.id}=${show(formatSignal(engine.readPin(node.id, p.id)))}`);
  console.log(`${node.label} (${node.type}): ${pins.join(" ")}`);
}
for (const d of engine.diagnostics)
  console.log(`${d.severity} ${d.code}: ${d.message}`);

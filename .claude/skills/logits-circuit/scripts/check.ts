import { readFileSync } from "node:fs";
import { GRID_SIZE, type Rect } from "@/lib/circuit/geometry";
import { fromJson } from "@/lib/circuit/io";
import { buildNetlist, pinKey } from "@/lib/circuit/netlist";
import { isWireAnchor, type Point } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import type { ParamSpec } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { buildScene, type ResolvedNode } from "@/state/scene";

/**
 * Validates a circuit file the way the app will read it, then lints its
 * layout for what makes a schematic hard to read.
 *
 *   check.ts <circuit.json> [--strict]
 *
 * Errors: the file does not load cleanly, or the netlist has an error
 * diagnostic. Warnings: things the app tolerates but a reader will not —
 * diagonal wires, wires through bodies, look-alike junctions, ungrouped
 * parts. `--strict` fails on warnings too. Exit code 1 on failure.
 */

type Level = "error" | "warn" | "info";
const findings: { level: Level; code: string; message: string }[] = [];
const report = (level: Level, code: string, message: string) =>
  findings.push({ level, code, message });

const args = process.argv.slice(2);
const file = args.find((arg) => !arg.startsWith("--"));
const strict = args.includes("--strict");
if (!file) {
  console.error("usage: check.ts <circuit.json> [--strict]");
  process.exit(2);
}

/** The preview opens at the origin, unfitted, in the Playwright viewport. */
const VIEWPORT = { width: 1600, height: 1000 };
const EPS = 1e-6;

const raw = JSON.parse(readFileSync(file, "utf8"));
const loaded = fromJson(raw);
if (!loaded.ok) {
  for (const issue of loaded.issues) {
    report("error", issue.code, issue.message);
  }
  finish();
}
if (!loaded.ok) process.exit(1);

const doc = loaded.document;
for (const issue of loaded.issues) {
  report(
    "error",
    issue.code,
    `${issue.message}${issue.elementId ? ` [${issue.elementId}]` : ""} — the element was dropped on load`,
  );
}

const lookup = subcircuitLookup(doc, lookupNode);
const netlist = buildNetlist(doc, lookup);
for (const d of netlist.diagnostics) {
  const where = [...(d.nodeIds ?? []), ...(d.wireIds ?? [])].join(", ");
  report(
    d.severity === "error" ? "error" : "warn",
    d.code,
    `${d.message}${where ? ` [${where}]` : ""}`,
  );
}

const scene = buildScene(doc, lookup, netlist.pinToNet);
const all = Object.values(scene.nodes);
const describe = (r: ResolvedNode) =>
  `${r.node.id} (${r.node.type}${r.node.label ? ` "${r.node.label}"` : ""})`;

// ---- params -----------------------------------------------------------------

function paramProblem(spec: ParamSpec, value: unknown): string | null {
  switch (spec.kind) {
    case "int":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return "expected an integer";
      }
      if (spec.min !== undefined && value < spec.min)
        return `below ${spec.min}`;
      if (spec.max !== undefined && value > spec.max)
        return `above ${spec.max}`;
      return null;
    case "bool":
      return typeof value === "boolean" ? null : "expected true/false";
    case "text":
      if (typeof value !== "string") return "expected a string";
      return spec.maxLength && value.length > spec.maxLength
        ? `longer than ${spec.maxLength}`
        : null;
    case "select":
    case "color":
      return spec.options.some((o) => o.value === value)
        ? null
        : `not one of ${spec.options.map((o) => o.value).join("/")}`;
  }
}

for (const { node, def, unknownType } of all) {
  if (unknownType) continue;
  const known = new Set([
    ...Object.keys(def.defaultParams),
    ...(def.paramsSchema ?? []).map((s) => s.key),
  ]);
  for (const key of Object.keys(node.params)) {
    if (!known.has(key)) {
      report(
        "warn",
        "unknown-param",
        `${node.id} (${node.type}) has no param "${key}"`,
      );
    }
  }
  for (const spec of def.paramsSchema ?? []) {
    if (!(spec.key in node.params)) continue;
    const problem = paramProblem(spec, node.params[spec.key]);
    if (problem) {
      report(
        "warn",
        "bad-param",
        `${node.id} (${node.type}) param "${spec.key}" = ${JSON.stringify(node.params[spec.key])}: ${problem}`,
      );
    }
  }
}

// ---- nodes ------------------------------------------------------------------

const circuit = all.filter((r) => !r.def.decoration);
const groups = all.filter((r) => r.def.decoration?.enclosure);
const notes = all.filter(
  (r) => r.def.decoration && !r.def.decoration.enclosure,
);

const offGrid = (v: number) =>
  Math.abs(v / GRID_SIZE - Math.round(v / GRID_SIZE)) > EPS;

for (const { node } of all) {
  if (offGrid(node.position.x) || offGrid(node.position.y)) {
    report(
      "warn",
      "off-grid",
      `${node.id} position ${node.position.x},${node.position.y} is not on the 10-unit grid`,
    );
  }
}

const inset = (r: Rect, by: number): Rect => ({
  x: r.x + by,
  y: r.y + by,
  width: r.width - 2 * by,
  height: r.height - 2 * by,
});
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.width <= outer.x + outer.width &&
  inner.y + inner.height <= outer.y + outer.height;

for (let i = 0; i < circuit.length; i++) {
  for (let j = i + 1; j < circuit.length; j++) {
    if (overlaps(circuit[i].bounds, circuit[j].bounds)) {
      report(
        "warn",
        "node-overlap",
        `${describe(circuit[i])} overlaps ${describe(circuit[j])}`,
      );
    }
  }
}

for (const note of notes) {
  for (const part of circuit) {
    if (overlaps(note.bounds, part.bounds)) {
      report(
        "warn",
        "note-over-node",
        `text ${note.node.id} covers ${describe(part)}`,
      );
    }
  }
}

// ---- wires ------------------------------------------------------------------

type Segment = { wireId: string; net: string; a: Point; b: Point };
const segments: Segment[] = [];
const vertices: { wireId: string; net: string; p: Point }[] = [];
let waypointCount = 0;
let branchCount = 0;
let wireLength = 0;

function segmentCrossesRect(a: Point, b: Point, r: Rect): boolean {
  // Liang–Barsky against the open box; the caller insets it so a wire that
  // leaves a pin on the edge, or runs along the edge, does not count.
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < EPS) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return (
    clip(-dx, a.x - r.x) &&
    clip(dx, r.x + r.width - a.x) &&
    clip(-dy, a.y - r.y) &&
    clip(dy, r.y + r.height - a.y) &&
    t1 - t0 > EPS
  );
}

for (const routed of Object.values(scene.wires)) {
  const { wire } = routed;
  if (isWireAnchor(wire.from)) branchCount++;
  waypointCount += wire.waypoints?.length ?? 0;
  const net = String(
    netlist.pinToNet[pinKey(wire.to.nodeId, wire.to.pinId)] ??
      `wire:${wire.id}`,
  );

  for (const p of wire.waypoints ?? []) {
    if (offGrid(p.x) || offGrid(p.y)) {
      report(
        "warn",
        "off-grid",
        `wire ${wire.id} waypoint ${p.x},${p.y} is not on the 10-unit grid`,
      );
    }
  }

  // Input to inout (a tunnel, a port) is stored either way round by the
  // editor and is fine; only an input wired into an output is backwards.
  if (
    routed.from?.spec.direction === "in" &&
    routed.to?.spec.direction === "out"
  ) {
    report(
      "warn",
      "wire-reversed",
      `wire ${wire.id} runs from an input pin to output pin ${wire.to.nodeId}.${wire.to.pinId}; put the driver in "from"`,
    );
  }

  const pts = routed.points;
  let diagonals = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const a = pts[k];
    const b = pts[k + 1];
    wireLength += Math.hypot(b.x - a.x, b.y - a.y);
    if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) diagonals++;
    segments.push({ wireId: wire.id, net, a, b });
    for (const part of circuit) {
      if (segmentCrossesRect(a, b, inset(part.bounds, 1))) {
        report(
          "warn",
          "wire-through-node",
          `wire ${wire.id} segment ${a.x},${a.y}→${b.x},${b.y} passes through ${describe(part)}`,
        );
      }
    }
    for (const note of notes) {
      if (segmentCrossesRect(a, b, inset(note.bounds, 1))) {
        report(
          "warn",
          "wire-under-note",
          `wire ${wire.id} runs under text ${note.node.id}, which paints above wires`,
        );
      }
    }
  }
  if (diagonals > 0) {
    report(
      "warn",
      "diagonal-wire",
      `wire ${wire.id} has ${diagonals} diagonal segment(s): ${pts.map((p) => `${p.x},${p.y}`).join(" → ")}`,
    );
  }
  for (const p of pts) vertices.push({ wireId: wire.id, net, p });
}

const orient = (o: Point, a: Point, b: Point) =>
  (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const strictlyInside = (s: Segment, p: Point) => {
  if (Math.abs(orient(s.a, s.b, p)) > EPS) return false;
  const dot = (p.x - s.a.x) * (s.b.x - s.a.x) + (p.y - s.a.y) * (s.b.y - s.a.y);
  const len2 = (s.b.x - s.a.x) ** 2 + (s.b.y - s.a.y) ** 2;
  return dot > EPS && dot < len2 - EPS;
};

let crossings = 0;
const overlapPairs = new Set<string>();
for (let i = 0; i < segments.length; i++) {
  for (let j = i + 1; j < segments.length; j++) {
    const s = segments[i];
    const t = segments[j];
    if (s.net === t.net) continue;
    const d1 = orient(s.a, s.b, t.a);
    const d2 = orient(s.a, s.b, t.b);
    const d3 = orient(t.a, t.b, s.a);
    const d4 = orient(t.a, t.b, s.b);
    if (d1 * d2 < -EPS && d3 * d4 < -EPS) {
      crossings++;
      continue;
    }
    const collinear = Math.abs(d1) < EPS && Math.abs(d2) < EPS;
    if (
      collinear &&
      (strictlyInside(s, t.a) ||
        strictlyInside(s, t.b) ||
        strictlyInside(t, s.a) ||
        strictlyInside(t, s.b))
    ) {
      const key = [s.wireId, t.wireId].sort().join(" & ");
      if (!overlapPairs.has(key)) {
        overlapPairs.add(key);
        report(
          "warn",
          "wire-overlap",
          `wires ${key} (different nets) run on top of each other — they read as connected`,
        );
      }
    }
  }
}

const junctionPairs = new Set<string>();
for (const v of vertices) {
  for (const s of segments) {
    if (s.net === v.net || !strictlyInside(s, v.p)) continue;
    const key = `${v.wireId}@${v.p.x},${v.p.y}|${s.wireId}`;
    if (junctionPairs.has(key)) continue;
    junctionPairs.add(key);
    report(
      "warn",
      "false-junction",
      `wire ${v.wireId} has a point at ${v.p.x},${v.p.y} on wire ${s.wireId} of another net — looks like a connection`,
    );
  }
}

const wireCount = Object.keys(doc.wires).length;
// Rails tapped by gate inputs cross by design; more crossings than wires is
// where a board stops being traceable.
if (crossings > Math.max(8, wireCount)) {
  report(
    "warn",
    "many-crossings",
    `${crossings} wire crossings across ${wireCount} wires — route long or fan-out signals through bus.tunnel pairs`,
  );
} else if (crossings > 0) {
  report("info", "crossings", `${crossings} wire crossing(s)`);
}

// ---- tunnels ----------------------------------------------------------------

const tunnels = circuit.filter((r) => r.def.netAliases);
const byName = new Map<string, ResolvedNode[]>();
for (const t of tunnels) {
  const aliases = t.def.netAliases?.(t.node.params) ?? {};
  const names = Object.values(aliases);
  if (names.length === 0) {
    report(
      "warn",
      "tunnel-unnamed",
      `${describe(t)} has a blank name and joins nothing`,
    );
  }
  for (const name of names) byName.set(name, [...(byName.get(name) ?? []), t]);
  for (const pin of t.pins) {
    const wired = Object.values(doc.wires).some(
      (w) =>
        (w.to.nodeId === t.node.id && w.to.pinId === pin.spec.id) ||
        (!isWireAnchor(w.from) &&
          w.from.nodeId === t.node.id &&
          w.from.pinId === pin.spec.id),
    );
    if (!wired)
      report(
        "warn",
        "tunnel-unwired",
        `${describe(t)} pin is not wired to anything`,
      );
  }
  const vertical = t.node.rotation === 90 || t.node.rotation === 270;
  const label = String(t.node.params.name ?? "").trim();
  if (vertical && label.length > 2) {
    report(
      "warn",
      "tunnel-name-clipped",
      `${describe(t)} is turned ${t.node.rotation}° and "${label}" is clipped to about 2 characters; keep it horizontal and bend the wire`,
    );
  }
}
for (const [name, members] of byName) {
  if (members.length < 2) {
    report(
      "warn",
      "tunnel-alone",
      `tunnel network "${name}" has only one tunnel (${members[0].node.id})`,
    );
  }
  const widths = new Set(members.map((m) => m.pins[0]?.spec.width));
  if (widths.size > 1) {
    report(
      "error",
      "tunnel-width",
      `tunnel network "${name}" mixes widths ${[...widths].join("/")}`,
    );
  }
}

// ---- annotation -------------------------------------------------------------

if (groups.length === 0)
  report(
    "warn",
    "no-groups",
    "no deco.group frames — group the stages of the circuit",
  );
if (notes.length === 0)
  report(
    "warn",
    "no-notes",
    "no deco.text notes — add a title/instructions note",
  );

for (const part of circuit) {
  if (!groups.some((g) => contains(g.bounds, part.bounds))) {
    report(
      "warn",
      "ungrouped",
      `${describe(part)} is not inside any deco.group`,
    );
  }
  if (
    ["io", "instruments"].includes(part.def.category) &&
    part.node.type !== "io.constant" &&
    !part.node.label
  ) {
    report(
      "warn",
      "unlabelled-io",
      `${describe(part)} has no label — inputs and outputs must be named`,
    );
  }
}

for (const g of groups) {
  const headerCells =
    g.def.decoration?.enclosure?.headerCells(g.node.params) ?? 0;
  const header: Rect = { ...g.bounds, height: headerCells * GRID_SIZE };
  for (const part of circuit) {
    if (contains(g.bounds, part.bounds) && overlaps(header, part.bounds)) {
      report(
        "warn",
        "on-group-header",
        `${describe(part)} sits on the header strip of group ${g.node.id}`,
      );
    }
  }
}
for (let i = 0; i < groups.length; i++) {
  for (let j = i + 1; j < groups.length; j++) {
    const a = groups[i].bounds;
    const b = groups[j].bounds;
    if (overlaps(a, b) && !contains(a, b) && !contains(b, a)) {
      report(
        "warn",
        "group-overlap",
        `groups ${groups[i].node.id} and ${groups[j].node.id} partly overlap — nest or separate them`,
      );
    }
  }
}

// ---- framing ----------------------------------------------------------------

const zoom = doc.defaultZoom ?? 1;
const rects = all.map((r) => r.bounds);
if (rects.length > 0) {
  const minX = Math.min(...rects.map((r) => r.x));
  const minY = Math.min(...rects.map((r) => r.y));
  const maxX = Math.max(...rects.map((r) => r.x + r.width));
  const maxY = Math.max(...rects.map((r) => r.y + r.height));
  report(
    "info",
    "bounds",
    `content ${minX},${minY} → ${maxX},${maxY} (world); opens at zoom ${zoom}`,
  );
  if (minX * zoom < 20 || minY * zoom < 70) {
    report(
      "warn",
      "under-chrome",
      `content starts at ${minX},${minY}; the preview opens at the origin, so keep x ≥ ${Math.ceil(20 / zoom)} and y ≥ ${Math.ceil(70 / zoom)} to clear the header and toolbar`,
    );
  }
  if (maxX * zoom > VIEWPORT.width - 20 || maxY * zoom > VIEWPORT.height - 20) {
    const fit =
      Math.floor(
        Math.min((VIEWPORT.width - 40) / maxX, (VIEWPORT.height - 40) / maxY) *
          100,
      ) / 100;
    report(
      "warn",
      "off-screen",
      `content reaches ${maxX},${maxY}, past a ${VIEWPORT.width}×${VIEWPORT.height} preview at zoom ${zoom}; set "defaultZoom": ${fit} or tighten the layout`,
    );
  }
}

report(
  "info",
  "stats",
  `${circuit.length} parts, ${groups.length} groups, ${notes.length} notes, ${wireCount} wires (${branchCount} branches, ${waypointCount} waypoints, ${Math.round(wireLength)} units), ${tunnels.length} tunnels on ${byName.size} networks, ${netlist.nets.length} nets`,
);

finish();

function finish() {
  const order: Level[] = ["error", "warn", "info"];
  for (const level of order) {
    for (const f of findings.filter((x) => x.level === level)) {
      console.log(`${level.toUpperCase().padEnd(5)} ${f.code}: ${f.message}`);
    }
  }
  const errors = findings.filter((f) => f.level === "error").length;
  const warnings = findings.filter((f) => f.level === "warn").length;
  console.log(
    `\n${errors} error(s), ${warnings} warning(s)${strict ? " [strict]" : ""}`,
  );
  process.exit(errors > 0 || (strict && warnings > 0) ? 1 : 0);
}

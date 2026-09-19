import { readFileSync } from "node:fs";

import { fromJson } from "@/lib/circuit/io";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import {
  elementsInRect,
  nodeAt,
  pinAt,
  waypointAt,
  wireAt,
} from "@/state/hit-test";
import { buildScene, paintOrder } from "@/state/scene";

/**
 * Times the picking a single pointer move runs, against a circuit file.
 *
 * `hit-test.ts` is pure, so this needs no browser: it is the same code the
 * canvas calls on every `pointermove`, and the "hover" line at the end is what
 * one move actually costs. Pair it with `bench-circuit.ts` for a board at the
 * 2,000-node target.
 *
 *   bench-circuit.ts /tmp/bench.json 2000
 *   bench-hit-test.ts /tmp/bench.json
 */

const file = process.argv[2];
const loaded = fromJson(JSON.parse(readFileSync(file, "utf8")));
if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));
const doc = loaded.document;
const scene = buildScene(doc, subcircuitLookup(doc, lookupNode));
const ids = Object.keys(scene.nodes);
console.log(`${ids.length} nodes, ${Object.keys(scene.wires).length} wires`);

// Points spread over the content, the way a pointer sweeps across a board.
let seed = 12345;
/** Deterministic, so two runs sweep the same points and can be compared. */
function rnd(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}
const bounds = ids.reduce(
  (acc, id) => {
    const b = scene.nodes[id].bounds;
    return {
      x0: Math.min(acc.x0, b.x),
      y0: Math.min(acc.y0, b.y),
      x1: Math.max(acc.x1, b.x + b.width),
      y1: Math.max(acc.y1, b.y + b.height),
    };
  },
  { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity },
);
const points = Array.from({ length: 200 }, () => ({
  x: bounds.x0 + rnd() * (bounds.x1 - bounds.x0),
  y: bounds.y0 + rnd() * (bounds.y1 - bounds.y0),
}));

function time(name: string, run: () => void, iterations = points.length) {
  run(); // warm
  const start = performance.now();
  run();
  const ms = performance.now() - start;
  console.log(
    `  ${name.padEnd(18)} ${(ms / iterations).toFixed(3)} ms/call   (${ms.toFixed(0)} ms for ${iterations})`,
  );
}

time("paintOrder", () => {
  for (const _ of points) paintOrder(scene);
});
time("pinAt", () => {
  for (const p of points) pinAt(scene, p);
});
time("nodeAt", () => {
  for (const p of points) nodeAt(scene, p);
});
time("wireAt", () => {
  for (const p of points) wireAt(scene, p);
});
time("waypointAt", () => {
  for (const p of points) waypointAt(scene, p, []);
});
time("elementsInRect", () => {
  for (const p of points)
    elementsInRect(scene, { x: p.x, y: p.y, width: 400, height: 400 });
});
console.log(
  "\n  one hover = paintOrder + pinAt + waypointAt + nodeAt + wireAt",
);
const start = performance.now();
for (const p of points) {
  pinAt(scene, p);
  waypointAt(scene, p, []);
  nodeAt(scene, p);
  wireAt(scene, p);
}
const ms = performance.now() - start;
console.log(
  `  hover              ${(ms / points.length).toFixed(3)} ms/move  (${(1000 / (ms / points.length)).toFixed(0)} moves/s budget)`,
);

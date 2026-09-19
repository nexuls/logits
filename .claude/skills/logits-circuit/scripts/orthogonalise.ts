import { readFileSync, writeFileSync } from "node:fs";
import { fromJson } from "@/lib/circuit/io";
import { buildNetlist, pinKey } from "@/lib/circuit/netlist";
import type { CircuitDocument, Point } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import { buildScene } from "@/state/scene";

/**
 * Squares the diagonal segments out of a circuit's wires.
 *
 * A diagonal is fixed by one elbow, and there are always two places to put it.
 * Which one is right is not a local question — the wrong elbow lands a run on
 * top of another net's wire, or puts a vertex on one, both of which read as a
 * connection that is not there. So each candidate is scored against the whole
 * board with the same measures `check.ts` warns on, and the better one wins.
 */

const EPS = 1e-6;
const file = process.argv[2];
const apply = process.argv.includes("--write");

const source = readFileSync(file, "utf8");
const raw = JSON.parse(source);
const loaded = fromJson(raw);
if (!loaded.ok) throw new Error(JSON.stringify(loaded.issues));

type Seg = { net: string; a: Point; b: Point };

function measure(doc: CircuitDocument) {
  const lookup = subcircuitLookup(doc, lookupNode);
  const netlist = buildNetlist(doc, lookup);
  const scene = buildScene(doc, lookup, netlist.pinToNet);
  const bodies = Object.values(scene.nodes)
    .filter((n) => n.def.decoration === undefined)
    .map((n) => n.bounds);

  const segs: Seg[] = [];
  const vertices: { net: string; p: Point }[] = [];
  let diagonals = 0;
  let throughNode = 0;
  let offGrid = 0;

  for (const [wireId, resolved] of Object.entries(scene.wires)) {
    // The real net, the way check.ts reads it: two wires of one net meeting is
    // a junction, not a mistake, and must not be scored as one.
    const wire = doc.wires[wireId];
    const net = String(
      netlist.pinToNet[pinKey(wire.to.nodeId, wire.to.pinId)] ?? `w:${wireId}`,
    );
    for (const p of wire.waypoints ?? []) {
      if (notOnGrid(p.x) || notOnGrid(p.y)) offGrid++;
    }
    const pts = resolved.points;
    for (const p of pts) vertices.push({ net, p });
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (Math.abs(a.x - b.x) > EPS && Math.abs(a.y - b.y) > EPS) diagonals++;
      segs.push({ net, a, b });
      for (const body of bodies) {
        if (
          segmentCrossesRect(a, b, {
            x: body.x + 1,
            y: body.y + 1,
            width: body.width - 2,
            height: body.height - 2,
          })
        ) {
          throughNode++;
        }
      }
    }
  }

  let overlaps = 0;
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      if (segs[i].net === segs[j].net) continue;
      if (overlapping(segs[i], segs[j])) overlaps++;
    }
  }

  let junctions = 0;
  for (const { net, p } of vertices) {
    for (const seg of segs) {
      if (seg.net === net) continue;
      if (pointOnSegment(p, seg.a, seg.b)) junctions++;
    }
  }

  return { diagonals, overlaps, junctions, throughNode, offGrid };
}

const GRID = 10;
const notOnGrid = (v: number) =>
  Math.abs(v / GRID - Math.round(v / GRID)) > EPS;

/** Lower is better; diagonals dominate, then the things that read as a join. */
const score = (m: ReturnType<typeof measure>) =>
  m.diagonals * 1000 +
  m.overlaps * 100 +
  m.junctions * 50 +
  m.throughNode * 30 +
  m.offGrid * 5;

function overlapping(p: Seg, q: Seg): boolean {
  const horizontal = (s: Seg) => Math.abs(s.a.y - s.b.y) <= EPS;
  const vertical = (s: Seg) => Math.abs(s.a.x - s.b.x) <= EPS;
  const span = (lo: number, hi: number, lo2: number, hi2: number) =>
    Math.min(Math.max(lo, hi), Math.max(lo2, hi2)) -
      Math.max(Math.min(lo, hi), Math.min(lo2, hi2)) >
    EPS;

  if (horizontal(p) && horizontal(q) && Math.abs(p.a.y - q.a.y) <= EPS) {
    return span(p.a.x, p.b.x, q.a.x, q.b.x);
  }
  if (vertical(p) && vertical(q) && Math.abs(p.a.x - q.a.x) <= EPS) {
    return span(p.a.y, p.b.y, q.a.y, q.b.y);
  }
  return false;
}

function pointOnSegment(p: Point, a: Point, b: Point): boolean {
  const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  if (Math.abs(cross) > EPS) return false;
  const within = (v: number, lo: number, hi: number) =>
    v >= Math.min(lo, hi) - EPS && v <= Math.max(lo, hi) + EPS;
  // Endpoints excluded: a wire meeting another at its end is a tap, not a
  // false junction.
  if (
    (Math.abs(p.x - a.x) <= EPS && Math.abs(p.y - a.y) <= EPS) ||
    (Math.abs(p.x - b.x) <= EPS && Math.abs(p.y - b.y) <= EPS)
  ) {
    return false;
  }
  return within(p.x, a.x, b.x) && within(p.y, a.y, b.y);
}

/** Liang–Barsky, exactly as check.ts does it — a bounding-box test would
 * call any diagonal a crossing and steer the scoring wrong. */
function segmentCrossesRect(
  a: Point,
  b: Point,
  r: { x: number; y: number; width: number; height: number },
): boolean {
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

function withWaypoints(
  doc: CircuitDocument,
  wireId: string,
  slot: number,
  corners: readonly Point[],
): CircuitDocument {
  const waypoints = [...(doc.wires[wireId].waypoints ?? [])];
  waypoints.splice(slot, 0, ...corners);
  return {
    ...doc,
    wires: { ...doc.wires, [wireId]: { ...doc.wires[wireId], waypoints } },
  };
}

/** Grid-aligned midpoint, so a Z-route's two corners stay on the grid. */
const mid = (a: number, b: number) => Math.round((a + b) / 2 / GRID) * GRID;

/**
 * Ways to square one diagonal off: the two single elbows, then the two
 * Z-routes that jog halfway across. A single elbow is usually right; the Z is
 * what is left when both elbows would put the run through a body.
 */
function routes(a: Point, b: Point): Point[][] {
  const mx = mid(a.x, b.x);
  const my = mid(a.y, b.y);
  return [
    [{ x: b.x, y: a.y }],
    [{ x: a.x, y: b.y }],
    [
      { x: mx, y: a.y },
      { x: mx, y: b.y },
    ],
    [
      { x: a.x, y: my },
      { x: b.x, y: my },
    ],
  ];
}

/** The first diagonal in the document, in a stable order. */
function firstDiagonal(doc: CircuitDocument) {
  const scene = buildScene(doc, subcircuitLookup(doc, lookupNode));
  for (const wireId of Object.keys(scene.wires).sort()) {
    const resolved = scene.wires[wireId];
    const pts = resolved.points;
    for (let k = 0; k + 1 < pts.length; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if (Math.abs(a.x - b.x) <= EPS || Math.abs(a.y - b.y) <= EPS) continue;
      return { wireId, slot: resolved.slots[k], a, b };
    }
  }
  return null;
}

let doc = loaded.document;
let inserted = 0;
for (let guard = 0; guard < 500; guard++) {
  const hit = firstDiagonal(doc);
  if (!hit) break;

  const candidates = routes(hit.a, hit.b).map((corners, rank) => {
    const next = withWaypoints(doc, hit.wireId, hit.slot, corners);
    // `rank` breaks ties toward the simpler route, so a Z is only taken when
    // it is genuinely better than both elbows rather than merely equal.
    return { next, score: score(measure(next)), rank };
  });

  candidates.sort((p, q) => p.score - q.score || p.rank - q.rank);
  doc = candidates[0].next;
  inserted++;
}

const before = measure(loaded.document);
const after = measure(doc);
console.log(
  `${file}: ${inserted} elbow(s)\n` +
    `  before  ${JSON.stringify(before)}\n` +
    `  after   ${JSON.stringify(after)}`,
);

if (apply) {
  const minified = !source.includes("\n");
  const out = { ...raw, wires: doc.wires };
  writeFileSync(
    file,
    minified ? JSON.stringify(out) : `${JSON.stringify(out, null, 2)}\n`,
  );
}

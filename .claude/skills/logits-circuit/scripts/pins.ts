import { readFileSync } from "node:fs";
import { GRID_SIZE, pinOffsets, rotateSize } from "@/lib/circuit/geometry";
import { fromJson } from "@/lib/circuit/io";
import type { PinSpec, Point, Rotation } from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import { buildScene } from "@/state/scene";

/**
 * Where a node's pins land, in world units — the numbers waypoints are
 * computed from. Footprints are derived (a block body widens to fit its
 * title), so never guess them from the node docs when params differ.
 *
 *   pins.ts <type> [paramsJson] [rotation] [x y]
 *   pins.ts --doc <circuit.json> [nodeId|label ...] [--wires]
 */

const STUB = GRID_SIZE;

function stub(point: Point, side: PinSpec["side"]): Point {
  switch (side) {
    case "left":
      return { x: point.x - STUB, y: point.y };
    case "right":
      return { x: point.x + STUB, y: point.y };
    case "top":
      return { x: point.x, y: point.y - STUB };
    default:
      return { x: point.x, y: point.y + STUB };
  }
}

const fmt = (p: Point) => `(${p.x}, ${p.y})`;

function pinLine(
  spec: PinSpec,
  side: PinSpec["side"],
  world: Point,
  showWorld: boolean,
) {
  const dir = `${spec.direction}${spec.tristate ? "*" : ""}`.padEnd(6);
  const where = showWorld
    ? `at ${fmt(world)} stub ${fmt(stub(world, side))}`
    : `dx,dy ${fmt(world)}`;
  return `  ${spec.id.padEnd(10)} ${spec.name.padEnd(8)} ${dir} w${String(spec.width).padEnd(3)} ${side.padEnd(6)} ${where}`;
}

const args = process.argv.slice(2);

if (args[0] === "--doc") {
  const file = args[1];
  if (!file) throw new Error("usage: pins.ts --doc <circuit.json> [ids...]");
  const loaded = fromJson(JSON.parse(readFileSync(file, "utf8")));
  if (!loaded.ok) {
    console.error(JSON.stringify(loaded.issues, null, 2));
    process.exit(1);
  }
  const doc = loaded.document;
  const showWires = args.includes("--wires");
  const filters = args.slice(2).filter((arg) => arg !== "--wires");
  const scene = buildScene(doc, subcircuitLookup(doc, lookupNode));

  for (const resolved of Object.values(scene.nodes)) {
    const { node, def, bounds, size } = resolved;
    if (
      filters.length > 0 &&
      !filters.includes(node.id) &&
      !filters.includes(node.label ?? "")
    ) {
      continue;
    }
    if (filters.length === 0 && def.decoration) continue;
    console.log(
      `${node.id} ${node.type}${node.label ? ` "${node.label}"` : ""} rot ${node.rotation ?? 0}` +
        ` — ${size.width}×${size.height} cells, box ${fmt(bounds)}→${fmt({ x: bounds.x + bounds.width, y: bounds.y + bounds.height })}`,
    );
    for (const pin of resolved.pins) {
      console.log(pinLine(pin.spec, pin.side, pin.world, true));
    }
  }

  if (showWires) {
    console.log("\nwires (routed polyline, pin endpoints included):");
    for (const wire of Object.values(scene.wires)) {
      const points = wire.points.map(fmt).join(" → ");
      console.log(`  ${wire.wire.id}: ${points || "UNROUTABLE"}`);
    }
  }
  process.exit(0);
}

const [type, paramsJson, rotationArg, xArg, yArg] = args;
if (!type) {
  console.error(
    "usage: pins.ts <type> [paramsJson] [rotation] [x y]\n       pins.ts --doc <circuit.json> [nodeId|label ...] [--wires]",
  );
  process.exit(2);
}
const def = lookupNode(type);
if (!def) {
  console.error(`unknown node type "${type}"`);
  process.exit(1);
}
const rotation = Number(rotationArg ?? 0) as Rotation;
if (![0, 90, 180, 270].includes(rotation)) {
  console.error("rotation must be 0, 90, 180 or 270");
  process.exit(2);
}
const params = { ...def.defaultParams, ...JSON.parse(paramsJson || "{}") };
const origin =
  xArg !== undefined && yArg !== undefined
    ? { x: Number(xArg), y: Number(yArg) }
    : null;

const size = def.size(params);
const rotated = rotateSize(size, rotation);
console.log(
  `${type} rot ${rotation} params ${JSON.stringify(params)}\n` +
    `footprint ${rotated.width}×${rotated.height} cells = ${rotated.width * GRID_SIZE}×${rotated.height * GRID_SIZE} world` +
    (origin
      ? `, box ${fmt(origin)}→${fmt({ x: origin.x + rotated.width * GRID_SIZE, y: origin.y + rotated.height * GRID_SIZE })}`
      : ""),
);
for (const o of pinOffsets(def.pins(params), size, rotation)) {
  const world = origin
    ? { x: origin.x + o.dx, y: origin.y + o.dy }
    : { x: o.dx, y: o.dy };
  console.log(pinLine(o.spec, o.side, world, origin !== null));
}

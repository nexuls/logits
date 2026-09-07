import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect, moveNodes } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { buildScene, clearSceneCaches } from "./scene";

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const and = requireNode("gate.and");
const led = requireNode("io.led");

let doc: CircuitDocument;
let andId: string;
let ledId: string;

beforeEach(() => {
  clearSceneCaches();

  const empty = createEmptyDocument("Scene");
  const first = addNode(empty, and, { position: { x: 0, y: 0 } });
  const second = addNode(first.document, led, { position: { x: 200, y: 0 } });
  const joined = connect(
    second.document,
    lookupNode,
    { nodeId: first.nodeId, pinId: "out" },
    { nodeId: second.nodeId, pinId: "in" },
  );
  if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);

  doc = joined.document;
  andId = first.nodeId;
  ledId = second.nodeId;
});

describe("buildScene", () => {
  it("leaves net ids null when built without a netlist", () => {
    const scene = buildScene(doc, lookupNode);
    expect(scene.nodes[andId].pinsById.out.netId).toBeNull();
  });

  it("fills net ids from the netlist, matching at both ends of a wire", () => {
    const netlist = buildNetlist(doc, lookupNode);
    const scene = buildScene(doc, lookupNode, netlist.pinToNet);

    const driver = scene.nodes[andId].pinsById.out.netId;
    const reader = scene.nodes[ledId].pinsById.in.netId;

    expect(driver).not.toBeNull();
    expect(driver).toBe(reader);
  });

  it("re-resolves a node when the netlist changes under it", () => {
    const netlist = buildNetlist(doc, lookupNode);
    const withNets = buildScene(doc, lookupNode, netlist.pinToNet);
    expect(withNets.nodes[andId].pinsById.out.netId).not.toBeNull();

    // Same document objects, no netlist: the identity cache must not serve the
    // entry it just built, or a rebuilt netlist would never reach the canvas.
    const without = buildScene(doc, lookupNode);
    expect(without.nodes[andId].pinsById.out.netId).toBeNull();
  });

  it("reuses the cached resolution when nothing changed", () => {
    const netlist = buildNetlist(doc, lookupNode);
    const first = buildScene(doc, lookupNode, netlist.pinToNet);
    const second = buildScene(doc, lookupNode, netlist.pinToNet);

    expect(second.nodes[andId]).toBe(first.nodes[andId]);
  });

  it("moves a node's pins and re-routes its wire", () => {
    const before = buildScene(doc, lookupNode);
    const moved = moveNodes(doc, [ledId], { x: 0, y: 100 });
    const after = buildScene(moved, lookupNode);

    expect(after.nodes[ledId].pinsById.in.world.y).toBe(
      before.nodes[ledId].pinsById.in.world.y + 100,
    );

    const wireId = Object.keys(after.wires)[0];
    expect(after.wires[wireId].points).not.toEqual(before.wires[wireId].points);
    // Still Manhattan after the move: every segment is axis-aligned.
    for (const [index, point] of after.wires[wireId].points.entries()) {
      if (index === 0) continue;
      const previous = after.wires[wireId].points[index - 1];
      expect(point.x === previous.x || point.y === previous.y).toBe(true);
    }
  });
});

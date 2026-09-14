import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect, connectToWire } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { boundsOf, buildScene, clearSceneCaches, sceneClusters } from "./scene";

/**
 * The minimap's per-group footprints. Grouping is topological, not spatial:
 * what matters is that a wire joins two nodes, never how close they sit.
 */

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const and = requireNode("gate.and");
const led = requireNode("io.led");

let empty: CircuitDocument;

beforeEach(() => {
  clearSceneCaches();
  empty = createEmptyDocument("Clusters");
});

function place(document: CircuitDocument, x: number, y: number) {
  const gate = addNode(document, and, { position: { x, y } });
  const lamp = addNode(gate.document, led, { position: { x: x + 200, y } });
  const joined = connect(
    lamp.document,
    lookupNode,
    { nodeId: gate.nodeId, pinId: "out" },
    { nodeId: lamp.nodeId, pinId: "in" },
  );
  if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);
  return { document: joined.document, gateId: gate.nodeId, ledId: lamp.nodeId };
}

const clusters = (document: CircuitDocument) =>
  sceneClusters(buildScene(document, lookupNode));

describe("sceneClusters", () => {
  it("has no groups on an empty canvas", () => {
    expect(clusters(empty)).toEqual([]);
    expect(boundsOf([])).toBeNull();
  });

  it("gives an unwired node a group of its own", () => {
    const first = addNode(empty, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, and, { position: { x: 500, y: 0 } });

    expect(clusters(second.document)).toHaveLength(2);
  });

  it("puts two nodes joined by a wire in one group", () => {
    expect(clusters(place(empty, 0, 0).document)).toHaveLength(1);
  });

  it("keeps two unconnected circuits apart", () => {
    const left = place(empty, 0, 0);
    const right = place(left.document, 2000, 0);

    const groups = clusters(right.document);
    expect(groups).toHaveLength(2);
    // Each box covers its own circuit, not the empty space between them.
    for (const group of groups) expect(group.width).toBeLessThan(1000);
  });

  it("merges the two once a wire joins them", () => {
    const left = place(empty, 0, 0);
    const right = place(left.document, 2000, 0);
    const joined = connect(
      right.document,
      lookupNode,
      { nodeId: left.gateId, pinId: "in0" },
      { nodeId: right.gateId, pinId: "out" },
    );
    if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);

    expect(clusters(joined.document)).toHaveLength(1);
  });

  it("counts a branch as part of the wire it taps", () => {
    const circuit = place(empty, 0, 0);
    const wireId = Object.keys(circuit.document.wires)[0];
    const second = addNode(circuit.document, led, {
      position: { x: 100, y: 200 },
    });

    const branched = connectToWire(
      second.document,
      lookupNode,
      { nodeId: second.nodeId, pinId: "in" },
      { wireId, slot: 0, point: { x: 120, y: 0 } },
    );
    if (!branched.ok) throw new Error(`branch failed: ${branched.reason}`);

    // The tapped LED joins the group through the wire, not through a pin of
    // its own on the gate.
    expect(clusters(branched.document)).toHaveLength(1);
  });

  it("covers every node and every wire bend", () => {
    const left = place(empty, 0, 0);
    const right = place(left.document, 2000, 0);
    const scene = buildScene(right.document, lookupNode);
    const whole = boundsOf(sceneClusters(scene));

    if (!whole) throw new Error("expected bounds");
    for (const node of Object.values(scene.nodes)) {
      expect(node.bounds.x).toBeGreaterThanOrEqual(whole.x);
      expect(node.bounds.x + node.bounds.width).toBeLessThanOrEqual(
        whole.x + whole.width,
      );
    }
    for (const wire of Object.values(scene.wires)) {
      for (const point of wire.points) {
        expect(point.x).toBeGreaterThanOrEqual(whole.x);
        expect(point.y).toBeGreaterThanOrEqual(whole.y);
      }
    }
  });

  it("is deterministic in output order", () => {
    const document = place(place(empty, 0, 0).document, 2000, 0).document;
    expect(clusters(document)).toEqual(clusters(document));
  });
});

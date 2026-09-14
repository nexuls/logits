import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect, setNodeParams } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument, Point } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  elementsInRect,
  nodeAt,
  pinAt,
  resizeHandleAt,
  wireAt,
  withEnclosedNodes,
} from "./hit-test";
import { buildScene, clearSceneCaches, paintOrder } from "./scene";

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const group = requireNode("deco.group");
const text = requireNode("deco.text");
const and = requireNode("gate.and");
const led = requireNode("io.led");

let doc: CircuitDocument;
let groupId: string;
let textId: string;
let andId: string;
let ledId: string;

/**
 * A 40 × 24-cell group at the origin (400 × 240 world) with a gate and a note
 * inside it, and an LED well outside, wired from the gate.
 */
beforeEach(() => {
  clearSceneCaches();

  let next = createEmptyDocument("Enclosures");
  const place = (definition: NodeDefinition, position: Point) => {
    const result = addNode(next, definition, { position });
    next = result.document;
    return result.nodeId;
  };

  andId = place(and, { x: 100, y: 100 });
  textId = place(text, { x: 180, y: 150 });
  ledId = place(led, { x: 700, y: 100 });
  groupId = place(group, { x: 0, y: 0 });

  const joined = connect(
    next,
    lookupNode,
    { nodeId: andId, pinId: "out" },
    { nodeId: ledId, pinId: "in" },
  );
  if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);
  doc = joined.document;
});

const scene = () => buildScene(doc, lookupNode);

describe("paintOrder", () => {
  it("paints enclosures beneath every other node, whatever their ids", () => {
    const order = paintOrder(scene());
    expect(order[0]).toBe(groupId);
    expect(order).toHaveLength(4);
  });

  it("paints a nested group over the larger one it sits in", () => {
    const inner = addNode(doc, group, {
      position: { x: 20, y: 40 },
      params: { width: 10, height: 10 },
    });
    doc = inner.document;

    const order = paintOrder(scene());
    expect(order.slice(0, 2)).toEqual([groupId, inner.nodeId]);
  });
});

describe("picking an enclosure", () => {
  it("grabs it by the header and by the edge", () => {
    const built = scene();
    expect(nodeAt(built, { x: 300, y: 10 })?.node.id).toBe(groupId);
    expect(nodeAt(built, { x: 2, y: 200 })?.node.id).toBe(groupId);
    expect(nodeAt(built, { x: 200, y: 238 })?.node.id).toBe(groupId);
  });

  it("lets a press on its empty interior through to the canvas", () => {
    expect(nodeAt(scene(), { x: 350, y: 60 })).toBeNull();
  });

  it("gives a node inside it the press, not the group", () => {
    const built = scene();
    const gate = built.nodes[andId].bounds;
    const inside = { x: gate.x + gate.width / 2, y: gate.y + gate.height / 2 };
    expect(nodeAt(built, inside)?.node.id).toBe(andId);
  });

  it("covers no pin of what it frames", () => {
    const built = scene();
    const pin = built.nodes[andId].pinsById.in0;
    expect(pinAt(built, pin.world)?.pin.spec.id).toBe("in0");
  });

  it("hides no wire running across it", () => {
    const built = scene();
    const wire = Object.values(built.wires)[0];
    const groupBounds = built.nodes[groupId].bounds;

    // A point on the wire inside the group, clear of every solid body.
    let probe: Point | null = null;
    for (let index = 0; index + 1 < wire.points.length && !probe; index++) {
      const [a, b] = [wire.points[index], wire.points[index + 1]];
      for (let t = 0; t <= 1; t += 0.05) {
        const point = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        const over = nodeAt(built, point);
        if (
          point.x > groupBounds.x + 20 &&
          point.x < groupBounds.x + groupBounds.width - 20 &&
          point.y > 40 &&
          (over === null || over.node.id === groupId)
        ) {
          probe = point;
          break;
        }
      }
    }

    expect(probe).not.toBeNull();
    if (probe) expect(wireAt(built, probe)?.wire.wire.id).toBe(wire.wire.id);
  });
});

describe("rubber band", () => {
  it("selects the parts inside a group without the group", () => {
    const built = scene();
    const found = elementsInRect(built, built.nodes[andId].bounds);
    expect(found.nodeIds).toEqual([andId]);
  });

  it("selects the group once the band surrounds it", () => {
    const found = elementsInRect(scene(), {
      x: -10,
      y: -10,
      width: 420,
      height: 260,
    });
    expect(found.nodeIds).toContain(groupId);
    expect(found.nodeIds).not.toContain(ledId);
  });
});

describe("withEnclosedNodes", () => {
  it("brings along everything wholly inside a carrying group", () => {
    expect(withEnclosedNodes(scene(), [groupId])).toEqual(
      [groupId, andId, textId].sort(),
    );
  });

  it("moves the group alone when it does not carry", () => {
    doc = setNodeParams(doc, groupId, { carry: false });
    expect(withEnclosedNodes(scene(), [groupId])).toEqual([groupId]);
  });

  it("leaves a node that only overlaps the group's edge behind", () => {
    const straddling = addNode(doc, led, { position: { x: 390, y: 100 } });
    doc = straddling.document;
    expect(withEnclosedNodes(scene(), [groupId])).not.toContain(
      straddling.nodeId,
    );
  });

  it("changes nothing for a selection with no enclosure in it", () => {
    expect(withEnclosedNodes(scene(), [andId, ledId])).toEqual(
      [andId, ledId].sort(),
    );
  });
});

describe("resizeHandleAt", () => {
  it("finds a corner and an edge handle of the sole selection", () => {
    const built = scene();
    expect(
      resizeHandleAt(built, { x: 401, y: 239 }, [groupId])?.handle,
    ).toEqual({ x: 1, y: 1 });
    expect(resizeHandleAt(built, { x: 0, y: 120 }, [groupId])?.handle).toEqual({
      x: -1,
      y: 0,
    });
  });

  it("offers no handles for a multi-selection or a fixed-size node", () => {
    const built = scene();
    expect(resizeHandleAt(built, { x: 400, y: 240 }, [groupId, andId])).toBe(
      null,
    );

    const gate = built.nodes[andId].bounds;
    expect(resizeHandleAt(built, { x: gate.x, y: gate.y }, [andId])).toBe(null);
  });
});

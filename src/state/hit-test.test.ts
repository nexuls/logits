import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  elementsInRect,
  nodeAt,
  pinAt,
  pinsCompatible,
  pinsMatchExactly,
  rectBetween,
  wireAt,
} from "./hit-test";
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

  const empty = createEmptyDocument("Hit test");
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

const scene = () => buildScene(doc, lookupNode);

describe("pinAt", () => {
  it("finds a pin at its exact world position", () => {
    const built = scene();
    const pin = built.nodes[andId].pinsById.in0;

    const hit = pinAt(built, pin.world);
    expect(hit?.node.node.id).toBe(andId);
    expect(hit?.pin.spec.id).toBe("in0");
  });

  it("respects the radius rather than snapping from anywhere", () => {
    const built = scene();
    const pin = built.nodes[andId].pinsById.in0;
    const far = { x: pin.world.x - 40, y: pin.world.y };

    expect(pinAt(built, far, 4)).toBeNull();
    expect(pinAt(built, far, 50)?.pin.spec.id).toBe("in0");
  });

  it("returns the nearest of two candidates", () => {
    const built = scene();
    const in0 = built.nodes[andId].pinsById.in0.world;
    const in1 = built.nodes[andId].pinsById.in1.world;
    // Just off in0, but within reach of both.
    const between = { x: in0.x, y: in0.y + (in1.y - in0.y) * 0.3 };

    expect(pinAt(built, between, 100)?.pin.spec.id).toBe("in0");
  });
});

describe("nodeAt", () => {
  it("hits inside the body and misses outside it", () => {
    const built = scene();
    const bounds = built.nodes[andId].bounds;

    expect(nodeAt(built, { x: bounds.x + 5, y: bounds.y + 5 })?.node.id).toBe(
      andId,
    );
    expect(nodeAt(built, { x: bounds.x - 20, y: bounds.y - 20 })).toBeNull();
  });
});

describe("wireAt", () => {
  it("picks the segment under the point and reports its index", () => {
    const built = scene();
    const wire = Object.values(built.wires)[0];
    const [a, b] = wire.points;
    const midpoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

    const hit = wireAt(built, midpoint);
    expect(hit?.index).toBe(0);
    expect(hit?.distance).toBeLessThan(0.001);
  });

  it("misses a point well off the route", () => {
    const built = scene();
    expect(wireAt(built, { x: 100, y: 500 })).toBeNull();
  });
});

describe("elementsInRect", () => {
  it("catches a node the band merely touches", () => {
    const built = scene();
    const bounds = built.nodes[andId].bounds;
    const band = rectBetween(
      { x: bounds.x - 100, y: bounds.y - 100 },
      { x: bounds.x + 2, y: bounds.y + 2 },
    );

    expect(elementsInRect(built, band).nodeIds).toEqual([andId]);
  });

  it("catches both nodes and the wire between them", () => {
    const built = scene();
    const found = elementsInRect(built, {
      x: -50,
      y: -50,
      width: 400,
      height: 200,
    });

    expect(found.nodeIds.sort()).toEqual([andId, ledId].sort());
    expect(found.wireIds).toHaveLength(1);
  });

  it("finds nothing in empty space", () => {
    const found = elementsInRect(scene(), {
      x: 1000,
      y: 1000,
      width: 50,
      height: 50,
    });

    expect(found).toEqual({ nodeIds: [], wireIds: [] });
  });
});

describe("pinsCompatible", () => {
  it("refuses two pins of the same direction and allows opposites", () => {
    const built = scene();
    const out = built.nodes[andId].pinsById.out;
    const in0 = built.nodes[andId].pinsById.in0;
    const ledIn = built.nodes[ledId].pinsById.in;

    expect(pinsCompatible(out, ledIn)).toBe(true);
    expect(pinsCompatible(in0, ledIn)).toBe(false);
    expect(pinsMatchExactly(out, ledIn)).toBe(true);
  });

  it("calls a width difference compatible — it is a diagnostic, not a refusal", () => {
    const built = scene();
    const out = built.nodes[andId].pinsById.out;
    const wide = {
      ...out,
      spec: { ...out.spec, direction: "in" as const, width: 8 },
    };

    expect(pinsCompatible(out, wide)).toBe(true);
    expect(pinsMatchExactly(out, wide)).toBe(false);
  });
});

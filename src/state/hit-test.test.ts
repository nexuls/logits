import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect, setWireWaypoints } from "@/lib/circuit/commands";
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
  waypointAt,
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

  it("misses a diagonal wire whose bounding box overlaps but which does not", () => {
    // The two nodes are offset in y, so their wire runs diagonally across the
    // gap. A band tucked into the corner of that diagonal's bounding box must
    // not catch it (ADR 0006).
    const offset = addNode(doc, led, { position: { x: 200, y: 200 } });
    const joined = connect(
      offset.document,
      lookupNode,
      { nodeId: andId, pinId: "in1" },
      { nodeId: offset.nodeId, pinId: "in" },
    );
    if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);

    const built = buildScene(joined.document, lookupNode);
    const diagonal = Object.keys(built.wires).find(
      (id) => built.wires[id].wire.to.nodeId === offset.nodeId,
    );
    if (!diagonal) throw new Error("the diagonal wire was not built");

    const band = { x: 170, y: 30, width: 20, height: 20 };
    expect(elementsInRect(built, band).wireIds).not.toContain(diagonal);

    // …while a band actually on the line does catch it.
    const middle = built.wires[diagonal].points[1];
    expect(
      elementsInRect(built, {
        x: middle.x - 5,
        y: middle.y - 5,
        width: 10,
        height: 10,
      }).wireIds,
    ).toContain(diagonal);
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

describe("waypointAt", () => {
  /** The wired pair, bent twice, plus the id of the wire that was bent. */
  function bentWire() {
    const wireId = Object.keys(doc.wires)[0];
    const bent = setWireWaypoints(doc, wireId, [
      { x: 60, y: 40 },
      { x: 140, y: 40 },
    ]);
    return { scene: buildScene(bent, lookupNode), wireId };
  }

  it("finds the handle nearest the point", () => {
    const { scene: built, wireId } = bentWire();

    const hit = waypointAt(built, { x: 138, y: 42 }, [wireId]);
    expect(hit?.index).toBe(1);
    expect(hit?.wire.wire.id).toBe(wireId);
  });

  it("ignores a wire that is not in the given set", () => {
    // Handles are drawn for selected wires only, so an unselected wire's bends
    // must not be grabbable.
    const { scene: built } = bentWire();
    expect(waypointAt(built, { x: 60, y: 40 }, [])).toBeNull();
  });

  it("finds nothing beyond the radius", () => {
    const { scene: built, wireId } = bentWire();
    expect(waypointAt(built, { x: 60, y: 80 }, [wireId])).toBeNull();
  });
});

describe("wireAt", () => {
  it("reports the point on the wire under the query, not a vertex of it", () => {
    const built = scene();
    const points = built.wires[Object.keys(built.wires)[0]].points;

    // Two grid cells along the first segment, then nudged off it: the hit
    // should come back projected onto the wire, nowhere near either vertex.
    const on = {
      x: points[0].x + (points[1].x - points[0].x) * 0.4,
      y: points[0].y + (points[1].y - points[0].y) * 0.4,
    };
    const hit = wireAt(built, { x: on.x, y: on.y + 3 });

    expect(hit).not.toBeNull();
    expect(hit?.point.x).toBeCloseTo(on.x);
    expect(hit?.point.y).toBeCloseTo(on.y);
  });

  it("says which document slot a bend dropped there would take", () => {
    const wireId = Object.keys(doc.wires)[0];
    const bent = setWireWaypoints(doc, wireId, [{ x: 100, y: 60 }]);
    const built = buildScene(bent, lookupNode);

    const before = wireAt(built, { x: 60, y: 30 }, 40);
    const after = wireAt(built, { x: 150, y: 30 }, 40);

    // Either side of the bend inserts either side of it in the list.
    expect(before?.wire.slots[before.index]).toBe(0);
    expect(after?.wire.slots[after.index]).toBe(1);
  });
});

import { beforeEach, describe, expect, it } from "vitest";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  addNode,
  boundsOf,
  connect,
  deleteElements,
  extractFragment,
  fragmentBounds,
  insertFragment,
  moveNodes,
  renameDocument,
  rotateNodes,
  setDefaultZoom,
  setNodeLabel,
  setNodeParams,
  setWireWaypoints,
  topLeftForCenter,
} from "./commands";
import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE } from "./coords";
import { createEmptyDocument } from "./io";
import type { CircuitDocument } from "./schema";

/** Narrowing through a helper, so the fixtures are `NodeDefinition` inside
 *  the hoisted helpers below rather than `NodeDefinition | undefined`. */
function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const and = requireNode("gate.and");
const led = requireNode("io.led");

let doc: CircuitDocument;

beforeEach(() => {
  doc = createEmptyDocument("Test circuit");
});

/** Adds an AND and an LED, wired output → input. */
function wiredPair() {
  const first = addNode(doc, and, { position: { x: 0, y: 0 } });
  const second = addNode(first.document, led, { position: { x: 100, y: 0 } });
  const joined = connect(
    second.document,
    lookupNode,
    { nodeId: first.nodeId, pinId: "out" },
    { nodeId: second.nodeId, pinId: "in" },
  );

  if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);

  return {
    document: joined.document,
    andId: first.nodeId,
    ledId: second.nodeId,
    wireId: joined.wireId,
  };
}

describe("addNode", () => {
  it("takes params from the definition and snaps to the grid", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 34, y: -7 },
    });
    const node = document.nodes[nodeId];

    expect(node.type).toBe("gate.and");
    expect(node.position).toEqual({ x: 30, y: -10 });
    expect(node.params).toEqual(and.defaultParams);
    expect(node.rotation).toBeUndefined();
  });

  it("merges params over the defaults and can skip snapping", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 34, y: -7 },
      params: { inputs: 3 },
      snap: false,
    });

    expect(document.nodes[nodeId].params).toMatchObject({
      inputs: 3,
      width: 1,
    });
    expect(document.nodes[nodeId].position).toEqual({ x: 34, y: -7 });
  });

  it("leaves the document it was given untouched", () => {
    addNode(doc, and, { position: { x: 0, y: 0 } });
    expect(Object.keys(doc.nodes)).toHaveLength(0);
  });

  it("gives each node its own id", () => {
    const first = addNode(doc, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, and, { position: { x: 0, y: 0 } });

    expect(first.nodeId).not.toBe(second.nodeId);
    expect(Object.keys(second.document.nodes)).toHaveLength(2);
  });
});

describe("topLeftForCenter", () => {
  it("offsets by half the node's footprint", () => {
    const size = and.size(and.defaultParams);
    const topLeft = topLeftForCenter(and, and.defaultParams, 0, {
      x: 100,
      y: 100,
    });

    expect(topLeft).toEqual({
      x: 100 - (size.width * 10) / 2,
      y: 100 - (size.height * 10) / 2,
    });
  });

  it("uses the rotated footprint, so a quarter turn swaps the offsets", () => {
    const upright = topLeftForCenter(and, and.defaultParams, 0, {
      x: 0,
      y: 0,
    });
    const turned = topLeftForCenter(and, and.defaultParams, 90, {
      x: 0,
      y: 0,
    });

    expect(turned.x).toBe(upright.y);
    expect(turned.y).toBe(upright.x);
  });
});

describe("moveNodes", () => {
  it("snaps the delta, not the destination, so spacing survives", () => {
    const first = addNode(doc, and, { position: { x: 3, y: 0 }, snap: false });
    const second = addNode(first.document, and, {
      position: { x: 47, y: 0 },
      snap: false,
    });

    const moved = moveNodes(second.document, [first.nodeId, second.nodeId], {
      x: 12,
      y: 0,
    });

    expect(moved.nodes[first.nodeId].position.x).toBe(13);
    expect(moved.nodes[second.nodeId].position.x).toBe(57);
  });

  it("returns the same document when the snapped delta is zero", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    expect(moveNodes(document, [nodeId], { x: 2, y: -3 })).toBe(document);
  });

  it("ignores ids that are not in the document", () => {
    const { document } = addNode(doc, and, { position: { x: 0, y: 0 } });
    expect(moveNodes(document, ["nope"], { x: 10, y: 10 })).toBe(document);
  });
});

describe("rotateNodes", () => {
  it("turns clockwise and wraps at 360", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    const once = rotateNodes(document, [nodeId]);
    expect(once.nodes[nodeId].rotation).toBe(90);

    const thrice = rotateNodes(once, [nodeId], 3);
    // Back to upright, and the field is dropped rather than stored as 0.
    expect(thrice.nodes[nodeId].rotation).toBeUndefined();
    expect("rotation" in thrice.nodes[nodeId]).toBe(false);
  });

  it("accepts anticlockwise turns", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    expect(rotateNodes(document, [nodeId], -1).nodes[nodeId].rotation).toBe(
      270,
    );
  });

  it("is a no-op for a whole turn", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    expect(rotateNodes(document, [nodeId], 4)).toBe(document);
  });
});

describe("params and labels", () => {
  it("merges a params patch and deletes on undefined", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    const widened = setNodeParams(document, nodeId, { inputs: 4 });
    expect(widened.nodes[nodeId].params).toMatchObject({ inputs: 4, width: 1 });

    const cleared = setNodeParams(widened, nodeId, { inputs: undefined });
    expect("inputs" in cleared.nodes[nodeId].params).toBe(false);
  });

  it("trims a label and drops an empty one", () => {
    const { document, nodeId } = addNode(doc, and, {
      position: { x: 0, y: 0 },
    });

    const labelled = setNodeLabel(document, nodeId, "  Carry  ");
    expect(labelled.nodes[nodeId].label).toBe("Carry");

    const cleared = setNodeLabel(labelled, nodeId, "   ");
    expect("label" in cleared.nodes[nodeId]).toBe(false);
  });

  it("renames the document but refuses an empty name", () => {
    expect(renameDocument(doc, " Adder ").name).toBe("Adder");
    expect(renameDocument(doc, "   ")).toBe(doc);
    expect(renameDocument(doc, doc.name)).toBe(doc);
  });
});

describe("connect", () => {
  it("wires two pins", () => {
    const { document, wireId } = wiredPair();
    expect(document.wires[wireId]).toBeDefined();
  });

  it("stores the driver as `from`, whichever end was drawn first", () => {
    const first = addNode(doc, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, led, {
      position: { x: 100, y: 0 },
    });

    // Drawn backwards: from the LED's input to the gate's output.
    const joined = connect(
      second.document,
      lookupNode,
      { nodeId: second.nodeId, pinId: "in" },
      { nodeId: first.nodeId, pinId: "out" },
    );

    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.document.wires[joined.wireId].from.nodeId).toBe(first.nodeId);
    expect(joined.document.wires[joined.wireId].to.nodeId).toBe(second.nodeId);
  });

  it("keeps the bends drawn with the wire, snapped to the grid", () => {
    const first = addNode(doc, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, led, {
      position: { x: 100, y: 0 },
    });

    const joined = connect(
      second.document,
      lookupNode,
      { nodeId: first.nodeId, pinId: "out" },
      { nodeId: second.nodeId, pinId: "in" },
      [{ x: 47, y: 62 }],
    );

    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.document.wires[joined.wireId].waypoints).toEqual([
      { x: 50, y: 60 },
    ]);
  });

  it("reverses the bends when the drawn direction is flipped to put the driver first", () => {
    const first = addNode(doc, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, led, {
      position: { x: 100, y: 0 },
    });

    // Drawn from the LED input, so `connect` swaps the ends — the bends must
    // follow, or the wire would replay its own route backwards.
    const joined = connect(
      second.document,
      lookupNode,
      { nodeId: second.nodeId, pinId: "in" },
      { nodeId: first.nodeId, pinId: "out" },
      [
        { x: 80, y: 40 },
        { x: 30, y: 40 },
      ],
    );

    if (!joined.ok) throw new Error(joined.reason);
    expect(joined.document.wires[joined.wireId].waypoints).toEqual([
      { x: 30, y: 40 },
      { x: 80, y: 40 },
    ]);
  });

  it("refuses a pin that does not exist", () => {
    const { document, andId, ledId } = wiredPair();
    const result = connect(
      document,
      lookupNode,
      { nodeId: andId, pinId: "in99" },
      { nodeId: ledId, pinId: "in" },
    );

    expect(result).toEqual({ ok: false, reason: "missing-pin" });
  });

  it("refuses the same pin, the same node, and a duplicate wire", () => {
    const { document, andId, ledId } = wiredPair();
    const ref = { nodeId: andId, pinId: "out" };

    expect(connect(document, lookupNode, ref, ref)).toEqual({
      ok: false,
      reason: "same-pin",
    });
    expect(
      connect(document, lookupNode, ref, { nodeId: andId, pinId: "in0" }),
    ).toEqual({ ok: false, reason: "same-node" });
    expect(
      connect(document, lookupNode, ref, { nodeId: ledId, pinId: "in" }),
    ).toEqual({ ok: false, reason: "already-connected" });
  });

  it("allows a circuit that is wrong but well-formed — that is the netlist's job", () => {
    const first = addNode(doc, and, { position: { x: 0, y: 0 } });
    const second = addNode(first.document, and, {
      position: { x: 100, y: 0 },
    });

    // Two outputs on one net: `multiple-drivers`, reported later, not refused.
    const joined = connect(
      second.document,
      lookupNode,
      { nodeId: first.nodeId, pinId: "out" },
      { nodeId: second.nodeId, pinId: "out" },
    );

    expect(joined.ok).toBe(true);
  });
});

describe("setWireWaypoints", () => {
  it("snaps bends and clears them when the list is empty", () => {
    const { document, wireId } = wiredPair();

    const bent = setWireWaypoints(document, wireId, [{ x: 47, y: 12 }]);
    expect(bent.wires[wireId].waypoints).toEqual([{ x: 50, y: 10 }]);

    const straight = setWireWaypoints(bent, wireId, []);
    expect("waypoints" in straight.wires[wireId]).toBe(false);
  });
});

describe("deleteElements", () => {
  it("takes attached wires with a deleted node", () => {
    const { document, andId, wireId } = wiredPair();
    const pruned = deleteElements(document, { nodeIds: [andId] });

    expect(pruned.nodes[andId]).toBeUndefined();
    expect(pruned.wires[wireId]).toBeUndefined();
  });

  it("deletes a wire on its own, leaving both nodes", () => {
    const { document, andId, ledId, wireId } = wiredPair();
    const pruned = deleteElements(document, { wireIds: [wireId] });

    expect(pruned.wires[wireId]).toBeUndefined();
    expect(pruned.nodes[andId]).toBeDefined();
    expect(pruned.nodes[ledId]).toBeDefined();
  });

  it("returns the same document when nothing matches", () => {
    const { document } = wiredPair();
    expect(deleteElements(document, { nodeIds: ["nope"] })).toBe(document);
    expect(deleteElements(document, {})).toBe(document);
  });
});

describe("boundsOf", () => {
  it("spans every node given, and is null when none exist", () => {
    const { document, andId, ledId } = wiredPair();
    const box = boundsOf(document, lookupNode, [andId, ledId]);

    expect(box?.x).toBe(0);
    expect(box?.width).toBeGreaterThan(100);
    expect(boundsOf(document, lookupNode, ["nope"])).toBeNull();
  });
});

describe("extractFragment", () => {
  it("keeps a wire only when both of its endpoints came along", () => {
    const { document, andId, ledId } = wiredPair();

    expect(
      extractFragment(document, { nodeIds: [andId, ledId] }).wires,
    ).toHaveLength(1);
    expect(extractFragment(document, { nodeIds: [andId] }).wires).toHaveLength(
      0,
    );
  });

  it("ignores ids the document does not have", () => {
    const { document, andId } = wiredPair();
    const fragment = extractFragment(document, { nodeIds: [andId, "nope"] });

    expect(fragment.nodes).toHaveLength(1);
    expect(fragment.nodes[0].id).toBe(andId);
  });
});

describe("insertFragment", () => {
  it("copies with fresh ids, leaving the originals untouched", () => {
    const { document, andId, ledId } = wiredPair();
    const fragment = extractFragment(document, { nodeIds: [andId, ledId] });
    const result = insertFragment(document, fragment, { x: 40, y: 0 });

    expect(Object.keys(result.document.nodes)).toHaveLength(4);
    expect(Object.keys(result.document.wires)).toHaveLength(2);
    expect(result.selection.nodeIds).toHaveLength(2);
    expect(result.selection.nodeIds).not.toContain(andId);

    // The originals must not have moved with their copies.
    expect(result.document.nodes[andId].position).toEqual({ x: 0, y: 0 });
  });

  it("rewires the copies to each other, never back to the originals", () => {
    const { document, andId, ledId } = wiredPair();
    const fragment = extractFragment(document, { nodeIds: [andId, ledId] });
    const result = insertFragment(document, fragment, { x: 40, y: 40 });

    const copied = result.document.wires[result.selection.wireIds[0]];
    expect(result.selection.nodeIds).toContain(copied.from.nodeId);
    expect(result.selection.nodeIds).toContain(copied.to.nodeId);
    expect(copied.from.pinId).toBe("out");
  });

  it("snaps the offset and shifts waypoints with the copy", () => {
    const { document, andId, ledId, wireId } = wiredPair();
    const bent = setWireWaypoints(document, wireId, [{ x: 50, y: 30 }]);
    const fragment = extractFragment(bent, { nodeIds: [andId, ledId] });
    const result = insertFragment(bent, fragment, { x: 13, y: 0 });

    const copied = result.document.wires[result.selection.wireIds[0]];
    // 13 snaps to 10, and the bend travels with the wire that owns it.
    expect(copied.waypoints).toEqual([{ x: 60, y: 30 }]);
  });

  it("does not touch params shared with the original", () => {
    const { document, andId } = wiredPair();
    const fragment = extractFragment(document, { nodeIds: [andId] });
    const result = insertFragment(document, fragment, { x: 40, y: 0 });

    const copyId = result.selection.nodeIds[0];
    expect(result.document.nodes[copyId].params).not.toBe(
      document.nodes[andId].params,
    );
  });

  it("returns the document it was given for an empty fragment", () => {
    const { document } = wiredPair();
    const result = insertFragment(
      document,
      { nodes: [], wires: [] },
      { x: 10, y: 10 },
    );

    expect(result.document).toBe(document);
    expect(result.selection.nodeIds).toEqual([]);
  });
});

describe("fragmentBounds", () => {
  it("spans the fragment's nodes, and is null when it has none", () => {
    const { document, andId, ledId } = wiredPair();
    const fragment = extractFragment(document, { nodeIds: [andId, ledId] });

    expect(fragmentBounds(fragment, lookupNode)?.x).toBe(0);
    expect(fragmentBounds({ nodes: [], wires: [] }, lookupNode)).toBeNull();
  });
});

describe("setDefaultZoom", () => {
  it("stores a zoom inside the viewport's limits", () => {
    expect(setDefaultZoom(doc, 0.5).defaultZoom).toBe(0.5);
  });

  it("clamps rather than refusing an out-of-range zoom", () => {
    expect(setDefaultZoom(doc, 99).defaultZoom).toBe(MAX_SCALE);
    expect(setDefaultZoom(doc, 0).defaultZoom).toBe(MIN_SCALE);
  });

  it("drops the field at 100%, so a reset circuit serialises as an unset one", () => {
    const zoomed = setDefaultZoom(doc, 2);
    const reset = setDefaultZoom(zoomed, DEFAULT_SCALE);

    expect("defaultZoom" in reset).toBe(false);
    expect(reset).toEqual(doc);
  });

  it("returns the same document when nothing changes", () => {
    const zoomed = setDefaultZoom(doc, 0.75);

    expect(setDefaultZoom(zoomed, 0.75)).toBe(zoomed);
    expect(setDefaultZoom(doc, DEFAULT_SCALE)).toBe(doc);
    expect(setDefaultZoom(doc, Number.NaN)).toBe(doc);
  });
});

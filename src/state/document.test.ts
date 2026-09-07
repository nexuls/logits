import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  closeDocument,
  connectPins,
  deleteSelection,
  getDocument,
  moveSelection,
  placeNode,
  redo,
  renameOpenDocument,
  resetDocumentStore,
  rotateSelection,
  setDocument,
  undo,
  updateNodeLabel,
  updateNodeParams,
} from "./document";

/**
 * The store is exercised through its command API, not its hooks: everything
 * undo and autosave hang off is plain functions, and this suite runs in the
 * node environment where there is no `window` — so writes fall back to a
 * no-op and only the in-memory behaviour is under test here.
 */

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const and = requireNode("gate.and");
const led = requireNode("io.led");

/** The store's own state is module-level, so each test starts from scratch. */
beforeEach(() => {
  resetDocumentStore();
  setDocument(createEmptyDocument("Test circuit"));
});

afterEach(() => {
  resetDocumentStore();
});

function nodeCount() {
  return Object.keys(getDocument()?.nodes ?? {}).length;
}

function positionX(nodeId: string) {
  const node = getDocument()?.nodes[nodeId];
  if (!node) throw new Error(`node ${nodeId} is not in the document`);
  return node.position.x;
}

describe("open and close", () => {
  it("refuses commands when nothing is open", () => {
    closeDocument();

    expect(getDocument()).toBeNull();
    expect(placeNode(and, { x: 0, y: 0 })).toBeNull();
    expect(moveSelection(["n"], { x: 10, y: 0 })).toBe(false);
    expect(undo()).toBe(false);
  });
});

describe("placeNode", () => {
  it("centres the node on the point it was given", () => {
    const nodeId = placeNode(and, { x: 100, y: 100 });
    if (!nodeId) throw new Error("placement failed");

    const node = getDocument()?.nodes[nodeId];
    const size = and.size(and.defaultParams);

    expect(node?.position).toEqual({
      x: 100 - (size.width * 10) / 2,
      y: 100 - (size.height * 10) / 2,
    });
  });

  it("is undoable, and redoable back to the same node", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 });
    expect(nodeCount()).toBe(1);

    expect(undo()).toBe(true);
    expect(nodeCount()).toBe(0);

    expect(redo()).toBe(true);
    expect(getDocument()?.nodes[nodeId as string]).toBeDefined();
  });
});

describe("undo and redo", () => {
  it("walks back through several edits in order", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 }) as string;
    // Placement centres the node, so its top-left is offset from the point.
    const placedX = positionX(nodeId);

    moveSelection([nodeId], { x: 50, y: 0 });
    rotateSelection([nodeId]);

    expect(getDocument()?.nodes[nodeId].rotation).toBe(90);

    undo();
    expect(getDocument()?.nodes[nodeId].rotation).toBeUndefined();
    expect(positionX(nodeId)).toBe(placedX + 50);

    undo();
    expect(positionX(nodeId)).toBe(placedX);

    undo();
    expect(nodeCount()).toBe(0);
    expect(undo()).toBe(false);
  });

  it("does not record an edit that changed nothing", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 }) as string;

    // Sub-grid delta: snaps to zero, so the document is untouched.
    expect(moveSelection([nodeId], { x: 2, y: 1 })).toBe(false);
    expect(deleteSelection({ nodeIds: ["missing"] })).toBe(false);

    // One undo still gets us back to empty, not "back to before the no-ops".
    expect(undo()).toBe(true);
    expect(nodeCount()).toBe(0);
  });

  it("folds a coalesced drag into a single step", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 }) as string;
    const placedX = positionX(nodeId);

    for (let step = 0; step < 5; step++) {
      moveSelection([nodeId], { x: 10, y: 0 }, { coalesce: true });
    }
    expect(positionX(nodeId)).toBe(placedX + 50);

    undo();
    expect(positionX(nodeId)).toBe(placedX);
  });

  it("drops the redo stack when a new edit follows an undo", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 }) as string;
    rotateSelection([nodeId]);
    undo();

    placeNode(led, { x: 200, y: 0 });
    expect(redo()).toBe(false);
    expect(nodeCount()).toBe(2);
  });
});

describe("wiring", () => {
  it("connects two pins and undoes the wire without the nodes", () => {
    const andId = placeNode(and, { x: 0, y: 0 }) as string;
    const ledId = placeNode(led, { x: 200, y: 0 }) as string;

    const result = connectPins(
      { nodeId: andId, pinId: "out" },
      { nodeId: ledId, pinId: "in" },
    );

    expect(result.ok).toBe(true);
    expect(Object.keys(getDocument()?.wires ?? {})).toHaveLength(1);

    undo();
    expect(Object.keys(getDocument()?.wires ?? {})).toHaveLength(0);
    expect(nodeCount()).toBe(2);
  });

  it("reports a refusal without touching the document or history", () => {
    const andId = placeNode(and, { x: 0, y: 0 }) as string;
    const before = getDocument();

    const result = connectPins(
      { nodeId: andId, pinId: "out" },
      { nodeId: andId, pinId: "in0" },
    );

    expect(result).toEqual({ ok: false, reason: "same-node" });
    expect(getDocument()).toBe(before);
  });

  it("deletes a node and its wires as one step", () => {
    const andId = placeNode(and, { x: 0, y: 0 }) as string;
    const ledId = placeNode(led, { x: 200, y: 0 }) as string;
    connectPins(
      { nodeId: andId, pinId: "out" },
      { nodeId: ledId, pinId: "in" },
    );

    expect(deleteSelection({ nodeIds: [andId] })).toBe(true);
    expect(nodeCount()).toBe(1);
    expect(Object.keys(getDocument()?.wires ?? {})).toHaveLength(0);

    undo();
    expect(nodeCount()).toBe(2);
    expect(Object.keys(getDocument()?.wires ?? {})).toHaveLength(1);
  });
});

describe("params, labels and the document name", () => {
  it("edits a node's params and label", () => {
    const nodeId = placeNode(and, { x: 0, y: 0 }) as string;

    expect(updateNodeParams(nodeId, { inputs: 3 })).toBe(true);
    expect(getDocument()?.nodes[nodeId].params).toMatchObject({ inputs: 3 });

    expect(updateNodeLabel(nodeId, "Carry")).toBe(true);
    expect(getDocument()?.nodes[nodeId].label).toBe("Carry");
  });

  it("renames the open document, ignoring an empty name", () => {
    expect(renameOpenDocument("Half adder")).toBe(true);
    expect(getDocument()?.name).toBe("Half adder");

    expect(renameOpenDocument("  ")).toBe(false);
    expect(getDocument()?.name).toBe("Half adder");
  });
});

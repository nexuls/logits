import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyDocument } from "@/lib/circuit/io";
import { buildNetlist } from "@/lib/circuit/netlist";
import { subcircuitType } from "@/lib/circuit/subcircuit";
import { lookupNode } from "@/lib/nodes/registry";
import {
  canPlaceSubcircuit,
  closeAllSubcircuits,
  closeSubcircuit,
  connectPins,
  createSubcircuitFromSelection,
  deleteSelection,
  deleteSubcircuitByKey,
  documentLookup,
  getDocument,
  getRootDocument,
  getSubcircuitPath,
  openSubcircuit,
  openSubcircuitKey,
  placeNode,
  redo,
  renameOpenDocument,
  renameSubcircuitByKey,
  resetDocumentStore,
  setDocument,
  subcircuitInstances,
  undo,
  updateNodeParams,
} from "./document";
import { buildScene } from "./scene";
import { getSelection, selectOnly } from "./selection";

/**
 * Editing a chip is a path into the project, not a second editor (ADR 0012).
 * What that has to buy is checked here: the ordinary commands edit whichever
 * document is open, the write-back lands in the root's library, and history
 * and autosave stay the project's throughout.
 */

function requireNode(type: string) {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const and = requireNode("gate.and");
const led = requireNode("io.led");

beforeEach(() => {
  resetDocumentStore();
  setDocument(createEmptyDocument("Test circuit"));
});

afterEach(() => {
  resetDocumentStore();
});

/** The id of the instance's first pin — what the wires in these tests land on. */
function firstPin(instanceId: string): string {
  const type = getRootDocument()?.nodes[instanceId].type ?? "";
  const pin = documentLookup()(type)?.pins({})[0];
  if (!pin) throw new Error("expected a pin on the instance");
  return pin.id;
}

/** The port inside the open chip that declares `name`. */
function portNamed(name: string) {
  const port = Object.values(getDocument()?.nodes ?? {}).find(
    (node) =>
      documentLookup()(node.type)?.boundaryPort?.(node.params)?.name === name,
  );
  if (!port) throw new Error(`expected the port called ${name}`);
  return port;
}

/** Wires in the project that land on this node, either end. */
function wiresOn(nodeId: string) {
  return Object.values(getRootDocument()?.wires ?? {}).filter(
    (wire) =>
      (!("wireId" in wire.from) && wire.from.nodeId === nodeId) ||
      wire.to.nodeId === nodeId,
  );
}

/** The pin ref a wire names at whichever end is not a tap. */
function pinRefOf(wire: { from: unknown; to: { pinId: string } }) {
  return "wireId" in (wire.from as object)
    ? wire.to
    : (wire.from as { pinId: string });
}

/** Wires the netlist says reach a pin that is not there. */
function danglingPins() {
  const document = getRootDocument();
  if (!document) throw new Error("nothing open");

  return buildNetlist(document, documentLookup()).diagnostics.filter(
    (diagnostic) => diagnostic.code === "unknown-pin",
  );
}

/** A gate feeding a lamp, with the gate boxed up into a chip of its own. */
function withChip() {
  const gate = placeNode(and, { x: 100, y: 100 });
  const lamp = placeNode(led, { x: 300, y: 100 });
  if (!gate || !lamp) throw new Error("expected two nodes");

  connectPins({ nodeId: gate, pinId: "out" }, { nodeId: lamp, pinId: "in" });

  const created = createSubcircuitFromSelection({ nodeIds: [gate] }, "Gate");
  if (!created) throw new Error("expected a subcircuit");
  return { ...created, gate, lamp };
}

describe("createSubcircuitFromSelection", () => {
  it("adds the chip to the project and leaves an instance", () => {
    const { key, instanceId, gate } = withChip();

    const root = getRootDocument();
    expect(root?.subcircuits?.[key]).toBeDefined();
    expect(root?.nodes[instanceId].type).toBe(subcircuitType(key));
    expect(root?.nodes[gate]).toBeUndefined();
  });

  it("is one undo step, chip and all", () => {
    const { key, instanceId } = withChip();

    undo();
    expect(getRootDocument()?.subcircuits?.[key]).toBeUndefined();
    expect(getRootDocument()?.nodes[instanceId]).toBeUndefined();

    redo();
    expect(getRootDocument()?.subcircuits?.[key]).toBeDefined();
  });

  it("refuses an empty selection", () => {
    expect(createSubcircuitFromSelection({ nodeIds: [] }, "Nothing")).toBeNull();
  });

  it("makes the instance's pins resolvable to the editor", () => {
    const { instanceId } = withChip();
    const node = getRootDocument()?.nodes[instanceId];
    const definition = documentLookup()(node?.type ?? "");

    expect(definition).toBeDefined();
    expect(definition?.pins({}).length).toBeGreaterThan(0);
  });
});

describe("opening a chip", () => {
  it("makes the chip the open document, leaving the project the root", () => {
    const { key } = withChip();

    expect(openSubcircuit(key)).toBe(true);
    expect(openSubcircuitKey()).toBe(key);
    expect(getDocument()?.name).toBe("Gate");
    expect(getRootDocument()?.name).toBe("Test circuit");
  });

  it("hands the chip the project's library, so its own chips resolve", () => {
    const { key } = withChip();
    openSubcircuit(key);

    // The library is the root's — flat, per ADR 0010 — so a chip placed
    // inside this one would be resolvable while it is open.
    expect(getDocument()?.subcircuits?.[key]).toBeDefined();
  });

  it("refuses a key the project does not define", () => {
    withChip();
    expect(openSubcircuit("nope")).toBe(false);
    expect(openSubcircuitKey()).toBeNull();
  });

  it("clears the selection on the way in and out", () => {
    const { key, instanceId } = withChip();
    selectOnly([instanceId]);

    openSubcircuit(key);
    expect(getSelection().nodeIds).toHaveLength(0);
  });

  it("steps back out one level at a time", () => {
    const { key } = withChip();
    openSubcircuit(key);

    expect(closeSubcircuit()).toBe(true);
    expect(openSubcircuitKey()).toBeNull();
    expect(closeSubcircuit()).toBe(false);
  });

  it("truncates rather than revisiting a chip already on the trail", () => {
    const { key } = withChip();
    openSubcircuit(key);
    openSubcircuit(key);

    expect(getSubcircuitPath()).toEqual([key]);
  });

  it("opens the project again from any depth", () => {
    const { key } = withChip();
    openSubcircuit(key);

    expect(closeAllSubcircuits()).toBe(true);
    expect(getSubcircuitPath()).toEqual([]);
  });
});

describe("editing inside a chip", () => {
  it("writes an edit back into the project's library", () => {
    const { key } = withChip();
    openSubcircuit(key);

    const lamp = placeNode(led, { x: 500, y: 500 });
    expect(lamp).not.toBeNull();

    // In the chip, and only in the chip.
    expect(getRootDocument()?.subcircuits?.[key]?.nodes[lamp as string])
      .toBeDefined();
    expect(getRootDocument()?.nodes[lamp as string]).toBeUndefined();
  });

  it("never stores a copy of the library inside a chip", () => {
    const { key } = withChip();
    openSubcircuit(key);
    placeNode(led, { x: 500, y: 500 });

    expect(getRootDocument()?.subcircuits?.[key]?.subcircuits).toBeUndefined();
  });

  it("undoes a chip's edit from the project's history", () => {
    const { key } = withChip();
    openSubcircuit(key);

    const before = Object.keys(
      getRootDocument()?.subcircuits?.[key]?.nodes ?? {},
    ).length;
    placeNode(led, { x: 500, y: 500 });
    undo();

    expect(
      Object.keys(getRootDocument()?.subcircuits?.[key]?.nodes ?? {}),
    ).toHaveLength(before);
  });

  it("renames the chip, not the project, through the header", () => {
    const { key } = withChip();
    openSubcircuit(key);
    renameOpenDocument("Conjunction");

    expect(getRootDocument()?.subcircuits?.[key]?.name).toBe("Conjunction");
    expect(getRootDocument()?.name).toBe("Test circuit");
  });

  it("changes every instance's pins when a port is renamed", () => {
    const { key, instanceId } = withChip();
    openSubcircuit(key);

    const chip = getDocument();
    const port = Object.values(chip?.nodes ?? {}).find(
      (node) => node.type === "sub.port",
    );
    if (!port) throw new Error("expected a port");

    updateNodeParams(port.id, { name: "RENAMED" });
    closeSubcircuit();

    const instance = getRootDocument()?.nodes[instanceId];
    const pins = documentLookup()(instance?.type ?? "")?.pins({}) ?? [];
    expect(pins.map((pin) => pin.id)).toContain("RENAMED");
  });

  it("redraws every instance's pins when a port is renamed", () => {
    const { key, instanceId } = withChip();

    // What the canvas draws, before and after: the scene is where a rename
    // has to land, and it caches a node's layout — so a chip, whose pins come
    // from its *contents* and not from the instance node, is the one thing
    // that can go stale there without the node changing.
    const pinsOnCanvas = () => {
      const document = getDocument();
      if (!document) throw new Error("nothing open");
      const scene = buildScene(document, documentLookup());
      return scene.nodes[instanceId].pins.map((pin) => pin.spec.name);
    };

    const before = pinsOnCanvas();
    expect(before.length).toBeGreaterThan(0);

    openSubcircuit(key);
    const port = Object.values(getDocument()?.nodes ?? {}).find(
      (node) => node.type === "sub.port",
    );
    if (!port) throw new Error("expected a port");
    updateNodeParams(port.id, { name: "RENAMED" });
    closeSubcircuit();

    expect(pinsOnCanvas()).toContain("RENAMED");
    expect(pinsOnCanvas()).not.toEqual(before);
  });

  it("takes the wires with it when a port is renamed", () => {
    const { key, instanceId, lamp } = withChip();
    const pin = firstPin(instanceId);

    connectPins(
      { nodeId: instanceId, pinId: pin },
      { nodeId: lamp, pinId: "in" },
    );
    expect(wiresOn(instanceId)).toHaveLength(1);

    openSubcircuit(key);
    updateNodeParams(portNamed(pin).id, { name: "RENAMED" });
    closeSubcircuit();

    // The wire moved to the new pin rather than being left on a pin that no
    // longer exists.
    const after = wiresOn(instanceId);
    expect(after).toHaveLength(1);
    expect(pinRefOf(after[0]).pinId).toBe("RENAMED");
    expect(danglingPins()).toHaveLength(0);
  });

  it("makes the rename and the wires it moves one undo step", () => {
    const { key, instanceId, lamp } = withChip();
    const pin = firstPin(instanceId);

    connectPins(
      { nodeId: instanceId, pinId: pin },
      { nodeId: lamp, pinId: "in" },
    );

    openSubcircuit(key);
    const port = portNamed(pin);
    updateNodeParams(port.id, { name: "RENAMED" });
    undo();

    // One step back is the old name *and* the old wiring: two steps would
    // leave the document in a state the user never saw.
    expect(
      getRootDocument()?.subcircuits?.[key]?.nodes[port.id].params.name,
    ).toBe(pin);
    expect(pinRefOf(wiresOn(instanceId)[0]).pinId).toBe(pin);
  });

  it("removes the wires when a port is deleted", () => {
    const { key, instanceId, lamp } = withChip();
    const pin = firstPin(instanceId);

    connectPins(
      { nodeId: instanceId, pinId: pin },
      { nodeId: lamp, pinId: "in" },
    );

    openSubcircuit(key);
    const port = portNamed(pin);
    deleteSelection({ nodeIds: [port.id] });
    closeSubcircuit();

    // Nowhere for the wire to go, so it goes — a dangling wire is a load-time
    // repair case, not something an edit is allowed to create.
    expect(wiresOn(instanceId)).toHaveLength(0);
    expect(danglingPins()).toHaveLength(0);
  });

  it("removes the wires when a port's name is cleared", () => {
    const { key, instanceId, lamp } = withChip();
    const pin = firstPin(instanceId);

    connectPins(
      { nodeId: instanceId, pinId: pin },
      { nodeId: lamp, pinId: "in" },
    );

    openSubcircuit(key);
    // A blank name defines no pin at all, so this is a removal and not a
    // rename to the empty string.
    updateNodeParams(portNamed(pin).id, { name: "" });
    closeSubcircuit();

    expect(wiresOn(instanceId)).toHaveLength(0);
    expect(danglingPins()).toHaveLength(0);
  });

  it("steps out when the open chip is undone away", () => {
    const { key } = withChip();
    openSubcircuit(key);

    // Undoing the edit that made the chip takes the document out from under
    // the editor, so the path has to come back with it.
    undo();
    expect(openSubcircuitKey()).toBeNull();
    expect(getDocument()?.name).toBe("Test circuit");
  });
});

describe("managing chips", () => {
  it("renames a chip without touching its key", () => {
    const { key, instanceId } = withChip();

    expect(renameSubcircuitByKey(key, "Conjunction")).toBe(true);
    expect(getRootDocument()?.subcircuits?.[key]?.name).toBe("Conjunction");
    expect(getRootDocument()?.nodes[instanceId].type).toBe(
      subcircuitType(key),
    );
  });

  it("counts the instances of a chip", () => {
    const { key } = withChip();
    expect(subcircuitInstances(key)).toBe(1);

    const definition = documentLookup()(subcircuitType(key));
    if (!definition) throw new Error("expected a definition");
    placeNode(definition, { x: 600, y: 600 });

    expect(subcircuitInstances(key)).toBe(2);
  });

  it("deletes a chip and every instance of it", () => {
    const { key, instanceId } = withChip();

    expect(deleteSubcircuitByKey(key)).toBe(true);
    expect(getRootDocument()?.subcircuits).toBeUndefined();
    expect(getRootDocument()?.nodes[instanceId]).toBeUndefined();
  });

  it("steps out of a chip it is asked to delete", () => {
    const { key } = withChip();
    openSubcircuit(key);

    deleteSubcircuitByKey(key);
    expect(openSubcircuitKey()).toBeNull();
    expect(getDocument()?.name).toBe("Test circuit");
  });

  it("refuses to delete a key the project does not have", () => {
    withChip();
    expect(deleteSubcircuitByKey("nope")).toBe(false);
  });

  it("will not place a chip inside itself", () => {
    const { key } = withChip();

    expect(canPlaceSubcircuit(key)).toBe(true);
    openSubcircuit(key);
    expect(canPlaceSubcircuit(key)).toBe(false);
  });
});

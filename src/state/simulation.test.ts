import { beforeEach, describe, expect, it } from "vitest";

import { addNode, connect, setNodeParams } from "@/lib/circuit/commands";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import type { FrameScheduler } from "@/lib/sim/runner";
import {
  configureSimulation,
  disposeSimulation,
  getEngine,
  getNetlist,
  play,
  readPinValue,
  resetSimulation,
  stepSimulation,
  syncDocument,
} from "./simulation";

/**
 * The runner is given a scheduler that never fires, so nothing here depends on
 * a browser or on wall-clock time — the store is exercised through the paused
 * paths, which is where an editor spends most of its life anyway.
 */
const frames: FrameScheduler = {
  request: () => 1,
  cancel: () => {},
};

function requireNode(type: string): NodeDefinition {
  const definition = lookupNode(type);
  if (!definition) throw new Error(`${type} is missing from the registry`);
  return definition;
}

const notGate = requireNode("gate.not");
const switchNode = requireNode("io.switch");

let doc: CircuitDocument;
let switchId: string;
let notId: string;

beforeEach(() => {
  configureSimulation({ runner: { frames } });
  disposeSimulation();

  const empty = createEmptyDocument("Sim");
  const first = addNode(empty, switchNode, { position: { x: 0, y: 0 } });
  const second = addNode(first.document, notGate, {
    position: { x: 100, y: 0 },
  });
  const joined = connect(
    second.document,
    lookupNode,
    { nodeId: first.nodeId, pinId: "out" },
    { nodeId: second.nodeId, pinId: "in" },
  );
  if (!joined.ok) throw new Error(`connect failed: ${joined.reason}`);

  doc = joined.document;
  switchId = first.nodeId;
  notId = second.nodeId;
});

describe("syncDocument", () => {
  it("compiles a netlist and settles the circuit", () => {
    syncDocument(doc);

    expect(getNetlist()?.nodes).toHaveLength(2);
    expect(readPinValue(switchId, "out")).toBe("0");
    expect(readPinValue(notId, "out")).toBe("1");
  });

  it("keeps the same engine when only a value param changed", () => {
    syncDocument(doc);
    const engine = getEngine();

    const flipped = setNodeParams(doc, switchId, { value: 1 });
    syncDocument(flipped);

    // The whole point: flipping a switch must not rebuild, because a rebuild
    // resets every net and forgets every latched value.
    expect(getEngine()).toBe(engine);
    expect(readPinValue(switchId, "out")).toBe("1");
    expect(readPinValue(notId, "out")).toBe("0");
  });

  it("rebuilds when a param changes the pin layout", () => {
    syncDocument(doc);
    const engine = getEngine();

    syncDocument(setNodeParams(doc, switchId, { width: 4 }));

    expect(getEngine()).not.toBe(engine);
    expect(readPinValue(switchId, "out")).toHaveLength(4);
  });

  it("rebuilds when the topology changes", () => {
    syncDocument(doc);
    const engine = getEngine();

    const added = addNode(doc, notGate, { position: { x: 200, y: 0 } });
    syncDocument(added.document);

    expect(getEngine()).not.toBe(engine);
    expect(getNetlist()?.nodes).toHaveLength(3);
  });

  it("keeps the engine when nodes only move", () => {
    syncDocument(doc);
    const engine = getEngine();

    syncDocument({
      ...doc,
      nodes: {
        ...doc.nodes,
        [switchId]: {
          ...doc.nodes[switchId],
          position: { x: 500, y: 500 },
        },
      },
    });

    // Positions are not in the netlist, so a drag must not touch the engine —
    // this runs on every frame of one.
    expect(getEngine()).toBe(engine);
  });

  it("tears everything down for a closed document", () => {
    syncDocument(doc);
    syncDocument(null);

    expect(getEngine()).toBeNull();
    expect(getNetlist()).toBeNull();
    expect(readPinValue(switchId, "out")).toBe("");
  });
});

describe("run controls", () => {
  it("steps and resets without a browser", () => {
    syncDocument(doc);
    stepSimulation();
    expect(getEngine()?.now).toBeGreaterThanOrEqual(0);

    resetSimulation();
    // Back to the start and settled: a reset lands a couple of gate delays in,
    // not at the far end of the settle budget.
    expect(getEngine()?.now).toBeLessThan(100);
    expect(readPinValue(notId, "out")).toBe("1");
  });

  it("survives play with a scheduler that never fires", () => {
    syncDocument(doc);
    play();
    expect(getEngine()).not.toBeNull();
  });
});

describe("readPinValue", () => {
  it("returns an empty string for a pin with no net", () => {
    syncDocument(doc);
    expect(readPinValue(switchId, "nope")).toBe("");
    expect(readPinValue("nope", "out")).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal } from "@/lib/sim/logic";
import { circuit } from "@/test/circuit";
import { buildNetlist } from "./netlist";
import type { CircuitDocument } from "./schema";
import {
  flattenDocument,
  MAX_SUBCIRCUIT_DEPTH,
  subcircuitLookup,
  subcircuitPorts,
  subcircuitType,
} from "./subcircuit";

/**
 * A chip is a document, an instance is a node, and the netlist has to end up
 * with neither — only the gates. These check both halves: the interface the
 * canvas draws, and the flat circuit the engine runs.
 */

/** An AND chip: two input ports, one gate, one output port. */
function andChip(): CircuitDocument {
  return {
    ...circuit(
      {
        pa: { type: "sub.port", params: { name: "A", direction: "in" } },
        pb: { type: "sub.port", params: { name: "B", direction: "in" } },
        gate: { type: "gate.and" },
        py: { type: "sub.port", params: { name: "Y", direction: "out" } },
      },
      [
        ["pa", "io", "gate", "in0"],
        ["pb", "io", "gate", "in1"],
        ["gate", "out", "py", "io"],
      ],
    ),
    id: "chip_and",
    name: "AND chip",
  };
}

/** A top-level circuit driving one instance of that chip. */
function withInstance(chips: Record<string, CircuitDocument>): CircuitDocument {
  const document = circuit({
    a: { type: "io.switch", params: { value: 1 } },
    b: { type: "io.switch", params: { value: 1 } },
    led: { type: "io.led" },
  });

  return {
    ...document,
    subcircuits: chips,
    nodes: {
      ...document.nodes,
      chip: {
        id: "chip",
        type: subcircuitType("and2"),
        position: { x: 0, y: 0 },
        params: {},
      },
    },
    wires: {
      w0: {
        id: "w0",
        from: { nodeId: "a", pinId: "out" },
        to: { nodeId: "chip", pinId: "A" },
      },
      w1: {
        id: "w1",
        from: { nodeId: "b", pinId: "out" },
        to: { nodeId: "chip", pinId: "B" },
      },
      w2: {
        id: "w2",
        from: { nodeId: "chip", pinId: "Y" },
        to: { nodeId: "led", pinId: "in" },
      },
    },
  };
}

describe("sub.port", () => {
  it("is a join, not a driver: its pin is `inout` whichever way it faces", () => {
    const definition = lookupNode("sub.port");
    if (!definition) throw new Error("sub.port is missing");

    for (const direction of ["in", "out"]) {
      const [pin] = definition.pins({ name: "A", direction });
      expect(pin.direction).toBe("inout");
    }

    // The direction the *instance* shows is declared instead, so the canvas
    // still puts a chip's inputs on its left.
    expect(
      definition.boundaryPort?.({ name: "A", direction: "in" })?.direction,
    ).toBe("in");
    expect(
      definition.boundaryPort?.({ name: "Y", direction: "out" })?.direction,
    ).toBe("out");
  });

  it("names no boundary while it has no name", () => {
    const definition = lookupNode("sub.port");
    expect(definition?.boundaryPort?.({ name: "  " })).toBeUndefined();
  });
});

describe("subcircuitPorts", () => {
  it("reads the interface off the chip's port nodes, inputs first", () => {
    const ports = subcircuitPorts(andChip(), lookupNode);

    expect(ports.map((port) => [port.name, port.direction])).toEqual([
      ["A", "in"],
      ["B", "in"],
      ["Y", "out"],
    ]);
  });
});

describe("subcircuitLookup", () => {
  it("gives an instance the pins its chip declares", () => {
    const document = withInstance({ and2: andChip() });
    const lookup = subcircuitLookup(document, lookupNode);
    const definition = lookup(subcircuitType("and2"));

    expect(definition?.title).toBe("AND chip");
    expect(definition?.pins({}).map((pin) => [pin.id, pin.side])).toEqual([
      ["A", "left"],
      ["B", "left"],
      ["Y", "right"],
    ]);
  });

  it("falls through to the registry, and is undefined for an unknown chip", () => {
    const lookup = subcircuitLookup(
      withInstance({ and2: andChip() }),
      lookupNode,
    );

    expect(lookup("gate.and")?.title).toBe("AND");
    expect(lookup(subcircuitType("nope"))).toBeUndefined();
  });
});

describe("flattenDocument", () => {
  it("replaces the instance with the chip's own nodes", () => {
    const document = withInstance({ and2: andChip() });
    const lookup = subcircuitLookup(document, lookupNode);
    const { document: flat } = flattenDocument(document, lookup);

    expect(flat.nodes.chip).toBeUndefined();
    expect(flat.nodes["chip/gate"]?.type).toBe("gate.and");
  });

  it("leaves a document with no instances exactly as it was", () => {
    const document = circuit({ a: { type: "gate.and" } });
    const { document: flat } = flattenDocument(document, lookupNode);

    expect(flat).toBe(document);
  });

  it("simulates through the boundary with no buffer in the way", () => {
    const document = withInstance({ and2: andChip() });
    const lookup = subcircuitLookup(document, lookupNode);
    const netlist = buildNetlist(document, lookup);
    const engine = new Engine(netlist, lookup);

    engine.runUntil(100);
    expect(formatSignal(engine.readPin("led", "in"))).toBe("1");

    expect(
      netlist.diagnostics.filter(
        (diagnostic) => diagnostic.severity === "error",
      ),
    ).toEqual([]);
  });

  it("reports a chip that instantiates something the document does not define", () => {
    const document = withInstance({});
    const lookup = subcircuitLookup(document, lookupNode);
    const { diagnostics } = buildNetlist(document, lookup);

    // Without a definition the type resolves to nothing at all, which is the
    // ordinary unknown-type story rather than a subcircuit-specific one.
    expect(diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "unknown-node-type",
    );
  });

  it("stops rather than inlining a chip defined in terms of itself", () => {
    const recursive: CircuitDocument = {
      ...circuit({
        p: { type: "sub.port", params: { name: "A", direction: "in" } },
      }),
      id: "chip_loop",
      name: "Loop",
    };
    recursive.nodes.inner = {
      id: "inner",
      type: subcircuitType("loop"),
      position: { x: 0, y: 0 },
      params: {},
    };

    const document: CircuitDocument = {
      ...circuit({}),
      subcircuits: { loop: recursive },
      nodes: {
        top: {
          id: "top",
          type: subcircuitType("loop"),
          position: { x: 0, y: 0 },
          params: {},
        },
      },
    };

    const lookup = subcircuitLookup(document, lookupNode);
    const { diagnostics } = flattenDocument(document, lookup);

    expect(diagnostics[0]?.code).toBe("subcircuit-recursion");
    expect(diagnostics[0]?.message).toContain(String(MAX_SUBCIRCUIT_DEPTH));
  });
});

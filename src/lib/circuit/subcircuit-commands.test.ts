import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { formatSignal } from "@/lib/sim/logic";
import { circuit } from "@/test/circuit";
import { GRID_SIZE } from "./geometry";
import { buildNetlist, pinKey } from "./netlist";
import { type CircuitDocument, isWireAnchor } from "./schema";
import {
  duplicatePortNames,
  subcircuitLookup,
  subcircuitPorts,
  subcircuitType,
} from "./subcircuit";
import {
  canInstantiate,
  createSubcircuit,
  nextSubcircuitKey,
  removeSubcircuit,
  renameSubcircuit,
  renameSubcircuitPort,
  subcircuitPreview,
  subcircuitUsage,
} from "./subcircuit-commands";

/**
 * Making a chip out of part of a circuit must not change what the circuit
 * does. That is the property most of these check: the same document, run
 * before and after, reads the same on the same pins.
 */

/** Switch → XOR ← switch, into an LED. The XOR alone is what gets boxed up. */
function halfAdder(): CircuitDocument {
  const document = circuit(
    {
      a: { type: "io.switch", params: { value: 1 } },
      b: { type: "io.switch", params: { value: 0 } },
      xor: { type: "gate.xor" },
      and: { type: "gate.and" },
      sum: { type: "io.led" },
      carry: { type: "io.led" },
    },
    [
      ["a", "out", "xor", "in0"],
      ["b", "out", "xor", "in1"],
      ["a", "out", "and", "in0"],
      ["b", "out", "and", "in1"],
      ["xor", "out", "sum", "in"],
      ["and", "out", "carry", "in"],
    ],
  );

  // Spread out, since the port columns and the instance are placed off the
  // selection's real box and a pile at the origin would say nothing.
  const at: Record<string, [number, number]> = {
    a: [0, 0],
    b: [0, 100],
    xor: [200, 0],
    and: [200, 100],
    sum: [400, 0],
    carry: [400, 100],
  };
  for (const [id, [x, y]] of Object.entries(at)) {
    document.nodes[id] = { ...document.nodes[id], position: { x, y } };
  }
  document.nodes.a = { ...document.nodes.a, label: "A" };
  document.nodes.b = { ...document.nodes.b, label: "B" };

  return document;
}

function make(
  document: CircuitDocument,
  nodeIds: readonly string[],
  name = "Chip",
) {
  const result = createSubcircuit(
    document,
    lookupNode,
    { nodeIds },
    { name },
  );
  if (!result) throw new Error("expected a subcircuit");
  return result;
}

describe("createSubcircuit", () => {
  it("moves the selection into a chip and leaves an instance behind", () => {
    const before = halfAdder();
    const { document, key, instanceId } = make(before, ["xor", "and"]);

    expect(document.nodes.xor).toBeUndefined();
    expect(document.nodes.and).toBeUndefined();
    expect(document.nodes[instanceId].type).toBe(subcircuitType(key));

    const chip = document.subcircuits?.[key];
    expect(chip?.nodes.xor).toBeDefined();
    expect(chip?.nodes.and).toBeDefined();
  });

  it("gives the chip a port for every wire that crossed its boundary", () => {
    const { document, key } = make(halfAdder(), ["xor", "and"]);
    const ports = subcircuitPorts(
      document.subcircuits?.[key] as CircuitDocument,
      lookupNode,
    );

    // Two switches in, two LEDs out. Each switch fed both gates, so its two
    // wires share one pin rather than each growing their own.
    expect(ports.filter((port) => port.direction === "in")).toHaveLength(2);
    expect(ports.filter((port) => port.direction === "out")).toHaveLength(2);
  });

  it("names the ports after the parts they were wired to", () => {
    const { ports } = make(halfAdder(), ["xor", "and"]);

    // `A` and `B` are the switches' labels; the outputs fall back to the pin
    // names of the LEDs they feed, which are the only names those have.
    expect(ports.map((port) => port.name).sort()).toContain("A");
    expect(ports.map((port) => port.name).sort()).toContain("B");
  });

  it("keeps the same pins reading the same values", () => {
    const before = halfAdder();
    const { document: after } = make(before, ["xor", "and"]);

    for (const [a, b] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      const read = (source: CircuitDocument) => {
        // Built by hand rather than through `engineFor`, which takes node
        // specs: these two documents differ in ways only a document can say.
        const lookup = subcircuitLookup(source, lookupNode);
        const engine = new Engine(buildNetlist(source, lookup), lookup);

        engine.setNodeParams("a", { width: 1, value: a });
        engine.setNodeParams("b", { width: 1, value: b });
        engine.runUntil(engine.now + 500);

        return [
          formatSignal(engine.readPin("sum", "in")),
          formatSignal(engine.readPin("carry", "in")),
        ];
      };

      expect(read(after)).toEqual(read(before));
    }
  });

  it("reports no errors after the change", () => {
    const { document } = make(halfAdder(), ["xor", "and"]);
    const netlist = buildNetlist(
      document,
      subcircuitLookup(document, lookupNode),
    );

    expect(
      netlist.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);
  });

  it("directions are from the chip's point of view", () => {
    const { ports } = make(halfAdder(), ["xor", "and"]);

    // The switches drive the chip, so their ports are inputs even though the
    // pins they land on inside it are inputs too.
    const byName = new Map(ports.map((port) => [port.name, port]));
    expect(byName.get("A")?.direction).toBe("in");
    expect(byName.get("B")?.direction).toBe("in");
  });

  it("puts the instance where the selection was", () => {
    const { document, instanceId } = make(halfAdder(), ["xor", "and"]);
    const position = document.nodes[instanceId].position;

    // The selection's box was x 200–260, y 0–140 or so; the instance is
    // centred on it, which is somewhere left of the LEDs and right of the
    // switches rather than at the origin.
    expect(position.x).toBeGreaterThan(0);
    expect(position.x).toBeLessThan(400);
    expect(position.x % GRID_SIZE).toBe(0);
    expect(position.y % GRID_SIZE).toBe(0);
  });

  it("lays the chip out with its ports either side of the body", () => {
    const { document, key } = make(halfAdder(), ["xor", "and"]);
    const chip = document.subcircuits?.[key] as CircuitDocument;

    const ports = Object.values(chip.nodes).filter(
      (node) => node.type === "sub.port",
    );
    const inputs = ports.filter((node) => node.params.direction === "in");
    const outputs = ports.filter((node) => node.params.direction === "out");
    const body = chip.nodes.xor.position.x;

    for (const port of inputs) expect(port.position.x).toBeLessThan(body);
    for (const port of outputs) expect(port.position.x).toBeGreaterThan(body);

    // Nothing inside the chip is at a negative coordinate: the selection is
    // shifted right to leave the input column its gutter.
    for (const node of Object.values(chip.nodes)) {
      expect(node.position.x).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not stack two ports on top of each other", () => {
    const { document, key } = make(halfAdder(), ["xor", "and"]);
    const chip = document.subcircuits?.[key] as CircuitDocument;

    const inputs = Object.values(chip.nodes)
      .filter((node) => node.type === "sub.port")
      .filter((node) => node.params.direction === "in")
      .map((node) => node.position.y)
      .sort((a, b) => a - b);

    for (let i = 1; i < inputs.length; i++) {
      expect(inputs[i] - inputs[i - 1]).toBeGreaterThanOrEqual(4 * GRID_SIZE);
    }
  });

  it("refuses a selection with no nodes in it", () => {
    expect(
      createSubcircuit(halfAdder(), lookupNode, { nodeIds: [] }, { name: "X" }),
    ).toBeNull();
  });

  it("gives an instance pin a value on the canvas", () => {
    const { document, instanceId, ports } = make(halfAdder(), ["xor", "and"]);
    const netlist = buildNetlist(
      document,
      subcircuitLookup(document, lookupNode),
    );

    // The instance's own pins are gone from the flat netlist, so without the
    // aliases nothing would tell the scene what they are carrying.
    for (const port of ports) {
      expect(netlist.pinToNet[pinKey(instanceId, port.name)]).toBeDefined();
    }
  });

  it("carries a branch across the boundary as a port", () => {
    const source = halfAdder();
    // A bend on the wire from the XOR to the Sum lamp, and a second lamp
    // tapping it. With both of those ends inside the selection, the wire goes
    // into the chip and the tap is what crosses out.
    source.wires.w4 = { ...source.wires.w4, waypoints: [{ x: 300, y: 20 }] };
    source.nodes.echo = {
      id: "echo",
      type: "io.led",
      position: { x: 400, y: 300 },
      params: { ...(lookupNode("io.led")?.defaultParams ?? {}) },
      label: "Echo",
    };
    source.wires.tap = {
      id: "tap",
      from: { wireId: "w4", waypoint: 0 },
      to: { nodeId: "echo", pinId: "in" },
    };

    const { document, key, instanceId } = make(source, ["xor", "and", "sum"]);
    const chip = document.subcircuits?.[key] as CircuitDocument;

    // The tapped wire went in with its bend, so the anchor still names a wire
    // that exists and a waypoint that is still at that index.
    expect(chip.wires.w4.waypoints).toHaveLength(1);

    // Inside, a port now taps that same wire; outside, the branch has become
    // an ordinary wire off a pin on the instance.
    expect(
      Object.values(chip.wires).some(
        (wire) => "wireId" in wire.from && wire.from.wireId === "w4",
      ),
    ).toBe(true);
    expect(document.wires.tap.from).toEqual({
      nodeId: instanceId,
      pinId: "Echo",
    });

    const netlist = buildNetlist(
      document,
      subcircuitLookup(document, lookupNode),
    );
    expect(
      netlist.diagnostics.filter((d) => d.severity === "error"),
    ).toHaveLength(0);

    // And it is still the same signal: the lamp outside reads what the lamp
    // inside the chip reads.
    const lookup = subcircuitLookup(document, lookupNode);
    const engine = new Engine(buildNetlist(document, lookup), lookup);
    engine.runUntil(engine.now + 500);
    expect(formatSignal(engine.readPin("echo", "in"))).toBe("1");
  });

  it("does not take a port name the selection already brought in", () => {
    const source = halfAdder();
    // A port the user placed and left at its default name, feeding the XOR.
    source.nodes.p = {
      id: "p",
      type: "sub.port",
      position: { x: 150, y: 60 },
      params: { name: "IN", direction: "in", width: 1 },
    };
    source.wires.wp = {
      id: "wp",
      from: { nodeId: "p", pinId: "io" },
      to: { nodeId: "xor", pinId: "in0" },
    };

    // The switches are unlabelled here, so the generated input ports fall back
    // to the default name — which the port coming in with the selection has.
    source.nodes.a = { ...source.nodes.a, label: "" };
    source.nodes.b = { ...source.nodes.b, label: "" };

    const { document, key } = make(source, ["xor", "and", "p"]);
    const chip = document.subcircuits?.[key] as CircuitDocument;
    const names = Object.values(chip.nodes)
      .filter((node) => node.type === "sub.port")
      .map((node) => node.params.name);

    expect(new Set(names).size).toBe(names.length);
    expect(duplicatePortNames(chip, lookupNode)).toEqual([]);
  });

  it("makes a chip out of a selection inside another chip's library", () => {
    const first = make(halfAdder(), ["xor"], "Sum");
    const second = createSubcircuit(
      first.document,
      subcircuitLookup(first.document, lookupNode),
      { nodeIds: ["and", first.instanceId] },
      { name: "Adder" },
    );
    if (!second) throw new Error("expected a subcircuit");

    // The library is flat: the outer chip holds an *instance* of the inner
    // one, not a copy of it, and both are defined at the root.
    const outer = second.document.subcircuits?.[second.key] as CircuitDocument;
    expect(second.document.subcircuits?.[first.key]).toBeDefined();
    expect(outer.subcircuits).toBeUndefined();
    expect(
      Object.values(outer.nodes).some(
        (node) => node.type === subcircuitType(first.key),
      ),
    ).toBe(true);
  });
});

describe("renameSubcircuitPort", () => {
  /** A chip instance with both its pins wired up, at the root. */
  function wiredInstance() {
    const created = make(halfAdder(), ["xor", "and"]);
    const input = created.ports.find((port) => port.direction === "in");
    const output = created.ports.find((port) => port.direction === "out");
    if (!input || !output) throw new Error("expected both directions");

    return { ...created, input, output };
  }

  it("moves the wires already on the pin", () => {
    const { document, key, instanceId, input } = wiredInstance();

    const renamed = renameSubcircuitPort(document, key, input.name, "NEW");
    const on = (pinId: string) =>
      Object.values(renamed.wires).filter(
        (wire) =>
          (!isWireAnchor(wire.from) &&
            wire.from.nodeId === instanceId &&
            wire.from.pinId === pinId) ||
          (wire.to.nodeId === instanceId && wire.to.pinId === pinId),
      ).length;

    expect(on(input.name)).toBe(0);
    expect(on("NEW")).toBeGreaterThan(0);
  });

  it("leaves nothing dangling", () => {
    const { document, key, output } = wiredInstance();
    const renamed = renameSubcircuitPort(document, key, output.name, "NEW");

    // The pin has to exist for the wire to be on it, which means the chip's
    // port has to be renamed too — that is the caller's half of the edit, so
    // rename both and check the result compiles.
    const chip = renamed.subcircuits?.[key] as CircuitDocument;
    const port = Object.values(chip.nodes).find(
      (node) =>
        node.type === "sub.port" && node.params.name === output.name,
    );
    if (!port) throw new Error("expected the port");

    const withPort: CircuitDocument = {
      ...renamed,
      subcircuits: {
        ...renamed.subcircuits,
        [key]: {
          ...chip,
          nodes: {
            ...chip.nodes,
            [port.id]: {
              ...port,
              params: { ...port.params, name: "NEW" },
            },
          },
        },
      },
    };

    const netlist = buildNetlist(
      withPort,
      subcircuitLookup(withPort, lookupNode),
    );
    expect(
      netlist.diagnostics.filter((d) => d.code === "unknown-pin"),
    ).toHaveLength(0);
  });

  it("reaches instances inside other chips", () => {
    const inner = make(halfAdder(), ["xor"], "Sum");
    const innerPin = inner.ports[0].name;

    const outer = createSubcircuit(
      inner.document,
      subcircuitLookup(inner.document, lookupNode),
      { nodeIds: ["and", inner.instanceId] },
      { name: "Adder" },
    );
    if (!outer) throw new Error("expected a subcircuit");

    const renamed = renameSubcircuitPort(
      outer.document,
      inner.key,
      innerPin,
      "NEW",
    );
    const adder = renamed.subcircuits?.[outer.key] as CircuitDocument;

    // The instance of the inner chip now lives inside the outer one, so the
    // wire that had to move is in a document that is not the root.
    expect(
      Object.values(adder.wires).some(
        (wire) =>
          wire.to.pinId === "NEW" ||
          (!isWireAnchor(wire.from) && wire.from.pinId === "NEW"),
      ),
    ).toBe(true);
  });

  it("returns the document it was given when there is nothing to move", () => {
    const { document, key } = wiredInstance();

    expect(renameSubcircuitPort(document, key, "A", "A")).toBe(document);
    expect(renameSubcircuitPort(document, key, "", "NEW")).toBe(document);
    expect(renameSubcircuitPort(document, key, "A", "")).toBe(document);
    expect(renameSubcircuitPort(document, key, "nosuchpin", "NEW")).toBe(
      document,
    );
  });
});

describe("subcircuitPreview", () => {
  it("counts what the selection would become", () => {
    const document = halfAdder();
    // Four signals cross: the two switches and the two LEDs. Each switch
    // feeds both gates, and one signal is one pin.
    expect(
      subcircuitPreview(document, lookupNode, { nodeIds: ["xor", "and"] }),
    ).toEqual({ nodes: 2, ports: 4 });
  });

  it("counts nothing for an empty selection", () => {
    expect(subcircuitPreview(halfAdder(), lookupNode, { nodeIds: [] })).toEqual(
      { nodes: 0, ports: 0 },
    );
  });
});

describe("nextSubcircuitKey", () => {
  it("slugs the name", () => {
    expect(nextSubcircuitKey(halfAdder(), lookupNode, "Half Adder!")).toBe(
      "half-adder",
    );
  });

  it("does not collide with a key already in use", () => {
    const { document, key } = make(halfAdder(), ["xor"], "Sum");
    expect(key).toBe("sum");
    expect(nextSubcircuitKey(document, lookupNode, "Sum")).toBe("sum-2");
  });

  it("does not take a key the registry would shadow", () => {
    // `sub.port` is a real node type, so a chip keyed `port` would never be
    // resolved — the lookup answers from the registry first.
    expect(nextSubcircuitKey(halfAdder(), lookupNode, "Port")).toBe("port-2");
  });

  it("falls back to a usable key for a name with nothing to slug", () => {
    expect(nextSubcircuitKey(halfAdder(), lookupNode, "···")).toBe("chip");
  });
});

describe("renameSubcircuit", () => {
  it("changes the name and not the key", () => {
    const { document, key, instanceId } = make(halfAdder(), ["xor"], "Sum");
    const renamed = renameSubcircuit(document, key, "Sum bit");

    expect(renamed.subcircuits?.[key]?.name).toBe("Sum bit");
    expect(renamed.nodes[instanceId].type).toBe(subcircuitType(key));
  });

  it("returns the document it was given when nothing changes", () => {
    const { document, key } = make(halfAdder(), ["xor"], "Sum");
    expect(renameSubcircuit(document, key, "Sum")).toBe(document);
    expect(renameSubcircuit(document, key, "  ")).toBe(document);
    expect(renameSubcircuit(document, "nope", "X")).toBe(document);
  });
});

describe("removeSubcircuit", () => {
  it("takes every instance and its wires with it", () => {
    const { document, key, instanceId } = make(halfAdder(), ["xor"], "Sum");
    const wiresBefore = Object.keys(document.wires).length;

    const stripped = removeSubcircuit(document, key);

    expect(stripped.subcircuits).toBeUndefined();
    expect(stripped.nodes[instanceId]).toBeUndefined();
    expect(Object.keys(stripped.wires).length).toBeLessThan(wiresBefore);

    // Nothing is left that the netlist cannot resolve.
    const netlist = buildNetlist(
      stripped,
      subcircuitLookup(stripped, lookupNode),
    );
    expect(
      netlist.diagnostics.filter((d) => d.code === "unknown-node-type"),
    ).toHaveLength(0);
  });

  it("removes instances inside other chips too", () => {
    const inner = make(halfAdder(), ["xor"], "Sum");
    const outer = createSubcircuit(
      inner.document,
      subcircuitLookup(inner.document, lookupNode),
      { nodeIds: ["and", inner.instanceId] },
      { name: "Adder" },
    );
    if (!outer) throw new Error("expected a subcircuit");

    const stripped = removeSubcircuit(outer.document, inner.key);
    const adder = stripped.subcircuits?.[outer.key] as CircuitDocument;

    expect(stripped.subcircuits?.[inner.key]).toBeUndefined();
    expect(
      Object.values(adder.nodes).some(
        (node) => node.type === subcircuitType(inner.key),
      ),
    ).toBe(false);
  });

  it("returns the document it was given for a key it does not have", () => {
    const document = halfAdder();
    expect(removeSubcircuit(document, "nope")).toBe(document);
  });
});

describe("subcircuitUsage", () => {
  it("finds instances in the root and in other chips", () => {
    const inner = make(halfAdder(), ["xor"], "Sum");
    const outer = createSubcircuit(
      inner.document,
      subcircuitLookup(inner.document, lookupNode),
      { nodeIds: ["and", inner.instanceId] },
      { name: "Adder" },
    );
    if (!outer) throw new Error("expected a subcircuit");

    const usage = subcircuitUsage(outer.document, inner.key);
    expect(usage).toHaveLength(1);
    expect(usage[0].ownerKey).toBe(outer.key);

    expect(subcircuitUsage(outer.document, outer.key)).toEqual([
      { ownerKey: null, nodeId: outer.instanceId },
    ]);
  });
});

describe("canInstantiate", () => {
  it("allows anything at the root", () => {
    const { document, key } = make(halfAdder(), ["xor"], "Sum");
    expect(canInstantiate(document, null, key)).toBe(true);
  });

  it("refuses a chip inside itself", () => {
    const { document, key } = make(halfAdder(), ["xor"], "Sum");
    expect(canInstantiate(document, key, key)).toBe(false);
  });

  it("refuses a chip that already contains the one being edited", () => {
    const inner = make(halfAdder(), ["xor"], "Sum");
    const outer = createSubcircuit(
      inner.document,
      subcircuitLookup(inner.document, lookupNode),
      { nodeIds: ["and", inner.instanceId] },
      { name: "Adder" },
    );
    if (!outer) throw new Error("expected a subcircuit");

    // Adder contains Sum, so Adder may not be placed inside Sum.
    expect(canInstantiate(outer.document, inner.key, outer.key)).toBe(false);
    // The other way round is what already happened, so it stays allowed.
    expect(canInstantiate(outer.document, outer.key, inner.key)).toBe(true);
  });
});

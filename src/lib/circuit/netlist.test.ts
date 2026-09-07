import { describe, expect, it } from "vitest";
import type { NodeDefinition, NodeLookup } from "@/lib/nodes/define";
import { buildNetlist, type Diagnostic, pinKey } from "./netlist";
import type { CircuitDocument, PinSpec } from "./schema";

/**
 * Hand-built fixtures rather than the real registry: `buildNetlist` must be
 * testable against pin layouts the catalog does not have (a 4-bit port, an
 * `inout` bus pin) without inventing catalog nodes to get them.
 */

const pin = (over: Partial<PinSpec> & Pick<PinSpec, "id" | "direction">) => ({
  name: over.id,
  width: 1,
  side: "left" as const,
  offset: 1,
  ...over,
});

const def = (type: string, pins: PinSpec[]): NodeDefinition => ({
  type,
  title: type,
  category: "test",
  defaultParams: {},
  pins: () => pins,
  size: () => ({ width: 4, height: 4 }),
});

const definitions = [
  def("test.and", [
    pin({ id: "in0", direction: "in" }),
    pin({ id: "in1", direction: "in" }),
    pin({ id: "out", direction: "out" }),
  ]),
  def("test.sink", [pin({ id: "in", direction: "in" })]),
  def("test.source", [pin({ id: "out", direction: "out" })]),
  def("test.bus4", [
    pin({ id: "in", direction: "in", width: 4 }),
    pin({ id: "out", direction: "out", width: 4 }),
  ]),
  def("test.tristate", [
    pin({ id: "in", direction: "in" }),
    pin({ id: "out", direction: "out", tristate: true }),
  ]),
  def("test.port", [pin({ id: "io", direction: "inout" })]),
];

const lookup: NodeLookup = (type) =>
  definitions.find((definition) => definition.type === type);

type Edge = [string, string, string, string];

function circuit(
  nodes: Record<string, string>,
  wires: readonly Edge[] = [],
): CircuitDocument {
  return {
    version: 1,
    id: "d_test",
    name: "Test",
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, type]) => [
        id,
        { id, type, position: { x: 0, y: 0 }, params: {} },
      ]),
    ),
    wires: Object.fromEntries(
      wires.map(([fromNode, fromPin, toNode, toPin], index) => {
        const id = `w${index}`;
        return [
          id,
          {
            id,
            from: { nodeId: fromNode, pinId: fromPin },
            to: { nodeId: toNode, pinId: toPin },
          },
        ];
      }),
    ),
  };
}

const codes = (diagnostics: readonly Diagnostic[]) =>
  diagnostics.map((diagnostic) => diagnostic.code).sort();

const only = (diagnostics: readonly Diagnostic[], code: string) =>
  diagnostics.filter((diagnostic) => diagnostic.code === code);

const netOf = (
  netlist: ReturnType<typeof buildNetlist>,
  nodeId: string,
  pinId: string,
) => netlist.pinToNet[pinKey(nodeId, pinId)];

describe("union-find grouping", () => {
  it("gives every pin a net, wired or not", () => {
    const netlist = buildNetlist(circuit({ a: "test.and" }), lookup);

    expect(netlist.nets).toHaveLength(3);
    expect(Object.keys(netlist.pinToNet)).toHaveLength(3);
  });

  it("merges pins joined by a wire into one net", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", b: "test.sink" }, [["a", "out", "b", "in"]]),
      lookup,
    );

    expect(netOf(netlist, "a", "out")).toBe(netOf(netlist, "b", "in"));
    expect(netlist.nets).toHaveLength(1);
  });

  it("merges transitively across a fan-out", () => {
    const netlist = buildNetlist(
      circuit({ src: "test.source", x: "test.sink", y: "test.sink" }, [
        ["src", "out", "x", "in"],
        ["src", "out", "y", "in"],
      ]),
      lookup,
    );

    const net = netOf(netlist, "src", "out");
    expect(netOf(netlist, "x", "in")).toBe(net);
    expect(netOf(netlist, "y", "in")).toBe(net);
    expect(netlist.nets).toHaveLength(1);
    expect(netlist.nets[net].drivers).toHaveLength(1);
    expect(netlist.nets[net].readers).toHaveLength(2);
  });

  it("splits drivers from readers by pin direction, inouts counting as both", () => {
    const netlist = buildNetlist(
      circuit({ p: "test.port", q: "test.port" }, [["p", "io", "q", "io"]]),
      lookup,
    );

    const [net] = netlist.nets;
    expect(net.drivers).toHaveLength(2);
    expect(net.readers).toHaveLength(2);
    // Two inouts are a legal bus, not a short.
    expect(codes(netlist.diagnostics)).not.toContain("multiple-drivers");
  });

  it("indexes nets densely from zero and mirrors readers into netToReaders", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", b: "test.sink", c: "test.sink" }, [
        ["a", "out", "b", "in"],
      ]),
      lookup,
    );

    expect(netlist.nets.map((net) => net.id)).toEqual([0, 1]);
    expect(netlist.netToReaders).toHaveLength(netlist.nets.length);
    for (const net of netlist.nets) {
      expect(netlist.netToReaders[net.id]).toBe(net.readers);
    }
  });

  it("records each node's pin nets alongside its pins", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", b: "test.sink" }, [["a", "out", "b", "in"]]),
      lookup,
    );

    const source = netlist.nodes.find((node) => node.id === "a");
    expect(source?.pinNets).toEqual({ out: netOf(netlist, "a", "out") });
    expect(netlist.nodes.map((node) => node.id)).toEqual(["a", "b"]);
  });

  it("numbers nets the same way whatever order the document was built in", () => {
    const forwards = circuit(
      { a: "test.source", b: "test.sink", c: "test.sink" },
      [
        ["a", "out", "b", "in"],
        ["a", "out", "c", "in"],
      ],
    );
    const backwards: CircuitDocument = {
      ...forwards,
      nodes: Object.fromEntries(Object.entries(forwards.nodes).reverse()),
      wires: Object.fromEntries(Object.entries(forwards.wires).reverse()),
    };

    expect(buildNetlist(backwards, lookup).pinToNet).toEqual(
      buildNetlist(forwards, lookup).pinToNet,
    );
  });
});

describe("width mismatch", () => {
  it("reports the offending wire and both its pins", () => {
    const netlist = buildNetlist(
      circuit({ wide: "test.bus4", thin: "test.sink" }, [
        ["wide", "out", "thin", "in"],
      ]),
      lookup,
    );

    const [diagnostic] = only(netlist.diagnostics, "width-mismatch");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.wireIds).toEqual(["w0"]);
    expect(diagnostic.message).toContain("4-bit");
    expect(diagnostic.nodeIds).toEqual(["wide", "thin"]);
  });

  it("still builds the net, at the widest pin's width", () => {
    const netlist = buildNetlist(
      circuit({ wide: "test.bus4", thin: "test.sink" }, [
        ["wide", "out", "thin", "in"],
      ]),
      lookup,
    );

    expect(netlist.nets[netOf(netlist, "thin", "in")].width).toBe(4);
  });

  it("says nothing when the widths agree", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.bus4", b: "test.bus4" }, [["a", "out", "b", "in"]]),
      lookup,
    );

    expect(codes(netlist.diagnostics)).not.toContain("width-mismatch");
    expect(netlist.nets[netOf(netlist, "a", "out")].width).toBe(4);
  });
});

describe("multi-driver detection", () => {
  it("flags two plain outputs on one net", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", b: "test.source", sink: "test.sink" }, [
        ["a", "out", "sink", "in"],
        ["b", "out", "sink", "in"],
      ]),
      lookup,
    );

    const [diagnostic] = only(netlist.diagnostics, "multiple-drivers");
    expect(diagnostic.severity).toBe("error");
    expect(diagnostic.nodeIds).toEqual(["a", "b"]);
    expect(diagnostic.netId).toBe(netOf(netlist, "sink", "in"));
  });

  it("allows several tri-state outputs to share a net", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.tristate", b: "test.tristate", sink: "test.sink" }, [
        ["a", "out", "sink", "in"],
        ["b", "out", "sink", "in"],
      ]),
      lookup,
    );

    expect(codes(netlist.diagnostics)).not.toContain("multiple-drivers");
  });

  it("does not flag one driver feeding many readers", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", x: "test.sink", y: "test.sink" }, [
        ["a", "out", "x", "in"],
        ["a", "out", "y", "in"],
      ]),
      lookup,
    );

    expect(netlist.diagnostics).toEqual([]);
  });
});

describe("undriven inputs", () => {
  it("warns about a reader with no driver", () => {
    const netlist = buildNetlist(circuit({ b: "test.sink" }), lookup);

    const [diagnostic] = only(netlist.diagnostics, "undriven-input");
    expect(diagnostic.severity).toBe("warning");
    expect(diagnostic.pins).toEqual([{ nodeId: "b", pinId: "in" }]);
  });

  it("says nothing about an unconnected output", () => {
    const netlist = buildNetlist(circuit({ a: "test.source" }), lookup);

    expect(netlist.diagnostics).toEqual([]);
  });
});

describe("broken references", () => {
  it("reports an unknown node type but keeps its wired pins connected", () => {
    const netlist = buildNetlist(
      circuit({ ghost: "test.missing", sink: "test.sink" }, [
        ["ghost", "q", "sink", "in"],
      ]),
      lookup,
    );

    const [diagnostic] = only(netlist.diagnostics, "unknown-node-type");
    expect(diagnostic.nodeIds).toEqual(["ghost"]);
    expect(netOf(netlist, "ghost", "q")).toBe(netOf(netlist, "sink", "in"));
    // Synthesised pins are `inout`, so the net counts as driven.
    expect(codes(netlist.diagnostics)).not.toContain("undriven-input");
  });

  it("reports a wire landing on a pin the definition no longer has", () => {
    const netlist = buildNetlist(
      circuit({ a: "test.source", b: "test.sink" }, [["a", "out", "b", "in9"]]),
      lookup,
    );

    const [diagnostic] = only(netlist.diagnostics, "unknown-pin");
    expect(diagnostic.wireIds).toEqual(["w0"]);
    expect(diagnostic.pins).toEqual([{ nodeId: "b", pinId: "in9" }]);
    // The wire is dropped, so the two pins stay on separate nets.
    expect(netOf(netlist, "a", "out")).not.toBe(netOf(netlist, "b", "in"));
  });
});

describe("an empty document", () => {
  it("compiles to an empty netlist without diagnostics", () => {
    const netlist = buildNetlist(circuit({}), lookup);

    expect(netlist).toEqual({
      nets: [],
      nodes: [],
      pinToNet: {},
      netToReaders: [],
      diagnostics: [],
    });
  });
});

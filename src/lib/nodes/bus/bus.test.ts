import { describe, expect, it } from "vitest";
import { buildNetlist, pinKey } from "@/lib/circuit/netlist";
import { lookupNode } from "@/lib/nodes/registry";
import { circuit, engineFor, evaluateOnce } from "@/test/circuit";
import { parseGroups } from "./groups";

describe("parseGroups", () => {
  it("reads lane counts, least significant first", () => {
    expect(parseGroups("4,4")).toEqual([4, 4]);
    expect(parseGroups("1 2 1")).toEqual([1, 2, 1]);
  });

  it("falls back rather than producing a zero-wide pin", () => {
    expect(parseGroups("")).toEqual([1, 1]);
    expect(parseGroups("0,-3")).toEqual([1, 1]);
    // Truncated at the widest bus the app supports.
    expect(parseGroups("300")).toEqual([1, 1]);
  });
});

describe("bus.split", () => {
  it("cuts a bus into its groups, least significant first", () => {
    const writes = evaluateOnce(
      "bus.split",
      // MSB first: bits 7..0 are 1010 0011.
      { in: "10100011" },
      { groups: "4,4" },
    );

    expect(writes.out0.value).toBe("0011");
    expect(writes.out1.value).toBe("1010");
  });

  it("passes Z and X through rather than normalising them", () => {
    const writes = evaluateOnce("bus.split", { in: "XZ" }, { groups: "1,1" });

    expect(writes.out0.value).toBe("Z");
    expect(writes.out1.value).toBe("X");
  });
});

describe("bus.merge", () => {
  it("is the inverse of the split", () => {
    expect(
      evaluateOnce("bus.merge", { in0: "0011", in1: "1010" }, { groups: "4,4" })
        .out.value,
    ).toBe("10100011");
  });

  it("round-trips a value through a split and back", () => {
    const groups = { groups: "2,3,1" };
    const split = evaluateOnce("bus.split", { in: "101101" }, groups);
    const merged = evaluateOnce(
      "bus.merge",
      {
        in0: split.out0.value,
        in1: split.out1.value,
        in2: split.out2.value,
      },
      groups,
    );

    expect(merged.out.value).toBe("101101");
  });
});

describe("bus.tunnel", () => {
  it("joins two pins that share a name into one net, with no wire", () => {
    const document = circuit(
      {
        source: { type: "io.switch", params: { value: 1 } },
        here: { type: "bus.tunnel", params: { name: "clk" } },
        there: { type: "bus.tunnel", params: { name: "clk" } },
        led: { type: "io.led" },
      },
      [
        ["source", "out", "here", "io"],
        ["there", "io", "led", "in"],
      ],
    );

    const netlist = buildNetlist(document, lookupNode);
    expect(netlist.pinToNet[pinKey("here", "io")]).toBe(
      netlist.pinToNet[pinKey("there", "io")],
    );
  });

  it("carries a value across the join", () => {
    const { at, run } = engineFor(
      {
        source: { type: "io.switch", params: { value: 1 } },
        here: { type: "bus.tunnel", params: { name: "clk" } },
        there: { type: "bus.tunnel", params: { name: "clk" } },
        led: { type: "io.led" },
      },
      [
        ["source", "out", "here", "io"],
        ["there", "io", "led", "in"],
      ],
    );

    run(20);
    expect(at("led", "in")).toBe("1");
  });

  it("joins nothing while it is unnamed", () => {
    const document = circuit({
      one: { type: "bus.tunnel" },
      two: { type: "bus.tunnel" },
    });

    const netlist = buildNetlist(document, lookupNode);
    expect(netlist.pinToNet[pinKey("one", "io")]).not.toBe(
      netlist.pinToNet[pinKey("two", "io")],
    );
  });

  it("reports a width mismatch between two tunnels of one name", () => {
    const document = circuit({
      narrow: { type: "bus.tunnel", params: { name: "bus", width: 1 } },
      wide: { type: "bus.tunnel", params: { name: "bus", width: 8 } },
    });

    const netlist = buildNetlist(document, lookupNode);
    expect(netlist.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "width-mismatch",
    );
  });
});

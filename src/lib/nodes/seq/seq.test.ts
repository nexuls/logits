import { describe, expect, it } from "vitest";
import type { NodeParams } from "@/lib/nodes/define";
import { engineFor, type Harness, outputOf } from "@/test/circuit";

/**
 * Sequential nodes are waveforms, not truth tables, so they are driven through
 * a real engine with a real clock. The cases that matter are the ones a
 * two-valued simulator cannot express: what `q` reads before the first edge,
 * and what an unresolved control does to it.
 */

/** A switch, a clock and the node under test, wired the usual way. */
function clocked(
  type: string,
  params: NodeParams = {},
  inputs: readonly string[] = ["d"],
): Harness {
  return engineFor(
    {
      clk: { type: "time.clock", params: { periodNs: 100 } },
      ...Object.fromEntries(
        inputs.map((id) => [id, { type: "io.switch", params: { value: 0 } }]),
      ),
      ff: { type, params },
    },
    [
      ["clk", "out", "ff", "clk"],
      ...inputs.map((id): [string, string, string, string] => [
        id,
        "out",
        "ff",
        id,
      ]),
    ],
  );
}

describe("seq.dff", () => {
  it("comes up unknown and latches `d` on the rising edge", () => {
    const { at, run, set } = clocked("seq.dff");

    // Real hardware powers up in an undefined state, and so does this.
    expect(at("ff", "q")).toBe("X");
    expect(at("ff", "qn")).toBe("X");

    set("d", { value: 1 });
    run(10);
    // The input moved but the clock has not: `q` must not follow it.
    expect(at("ff", "q")).toBe("X");

    run(60);
    expect(at("ff", "q")).toBe("1");
    expect(at("ff", "qn")).toBe("0");

    set("d", { value: 0 });
    run(10);
    expect(at("ff", "q")).toBe("1");
    run(100);
    expect(at("ff", "q")).toBe("0");
  });

  it("clears asynchronously while `rst` is high", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        d: { type: "io.switch", params: { value: 1 } },
        rst: { type: "io.switch", params: { value: 0 } },
        ff: { type: "seq.dff" },
      },
      [
        ["clk", "out", "ff", "clk"],
        ["d", "out", "ff", "d"],
        ["rst", "out", "ff", "rst"],
      ],
    );

    harness.run(120);
    expect(harness.at("ff", "q")).toBe("1");

    // Between edges, so only an asynchronous clear can do this.
    harness.set("rst", { value: 1 });
    harness.run(10);
    expect(harness.at("ff", "q")).toBe("0");
    expect(harness.at("ff", "qn")).toBe("1");
  });

  it("holds through an edge while `en` is low", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        d: { type: "io.switch", params: { value: 1 } },
        en: { type: "io.switch", params: { value: 0 } },
        ff: { type: "seq.dff" },
      },
      [
        ["clk", "out", "ff", "clk"],
        ["d", "out", "ff", "d"],
        ["en", "out", "ff", "en"],
      ],
    );

    harness.run(300);
    expect(harness.at("ff", "q")).toBe("X");

    harness.set("en", { value: 1 });
    harness.run(150);
    expect(harness.at("ff", "q")).toBe("1");
  });

  it("stores a whole word at any width", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        d: { type: "io.switch", params: { width: 4, value: 0b1011 } },
        ff: { type: "seq.dff", params: { width: 4 } },
      },
      [
        ["clk", "out", "ff", "clk"],
        ["d", "out", "ff", "d"],
      ],
    );

    harness.run(120);
    expect(harness.at("ff", "q")).toBe("1011");
    expect(harness.at("ff", "qn")).toBe("0100");
  });
});

describe("seq.jkff", () => {
  it("holds, sets, clears and toggles", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        j: { type: "io.switch", params: { value: 1 } },
        k: { type: "io.switch", params: { value: 0 } },
        ff: { type: "seq.jkff" },
      },
      [
        ["clk", "out", "ff", "clk"],
        ["j", "out", "ff", "j"],
        ["k", "out", "ff", "k"],
      ],
    );

    // J=1 K=0 sets.
    harness.run(120);
    expect(harness.at("ff", "q")).toBe("1");

    // J=0 K=1 clears.
    harness.set("j", { value: 0 });
    harness.set("k", { value: 1 });
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("0");

    // J=1 K=1 toggles on every edge.
    harness.set("j", { value: 1 });
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("1");
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("0");

    // J=0 K=0 holds.
    harness.set("j", { value: 0 });
    harness.set("k", { value: 0 });
    harness.run(200);
    expect(harness.at("ff", "q")).toBe("0");
  });
});

describe("seq.tff", () => {
  it("divides the clock by two once reset has given it a value", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        t: { type: "io.switch", params: { value: 1 } },
        rst: { type: "io.switch", params: { value: 1 } },
        ff: { type: "seq.tff" },
      },
      [
        ["clk", "out", "ff", "clk"],
        ["t", "out", "ff", "t"],
        ["rst", "out", "ff", "rst"],
      ],
    );

    // Toggling an unknown value is still unknown, so a T flip-flop cannot
    // leave `X` on its own — exactly like the real part, which is why it has a
    // reset at all.
    harness.run(300);
    expect(harness.at("ff", "q")).toBe("0");

    harness.set("rst", { value: 0 });
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("1");
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("0");
    harness.run(100);
    expect(harness.at("ff", "q")).toBe("1");
  });
});

describe("seq.latch", () => {
  it("is transparent while `en` is high and holds when it falls", () => {
    const harness = engineFor(
      {
        d: { type: "io.switch", params: { value: 1 } },
        en: { type: "io.switch", params: { value: 1 } },
        latch: { type: "seq.latch" },
      },
      [
        ["d", "out", "latch", "d"],
        ["en", "out", "latch", "en"],
      ],
    );

    harness.run(20);
    expect(harness.at("latch", "q")).toBe("1");

    harness.set("d", { value: 0 });
    harness.run(20);
    expect(harness.at("latch", "q")).toBe("0");

    harness.set("en", { value: 0 });
    harness.set("d", { value: 1 });
    harness.run(20);
    // Held: the input moved but the latch is closed.
    expect(harness.at("latch", "q")).toBe("0");
    expect(harness.at("latch", "qn")).toBe("1");
  });

  it("is unknown while nothing drives `en`", () => {
    expect(outputOf("seq.latch", { d: "1" }, "q")).toBe("X");
  });
});

describe("seq.register", () => {
  it("has no `set` or `qn`, unlike the flip-flop it shares code with", () => {
    const harness = engineFor({ reg: { type: "seq.register" } });
    const ids = harness.engine.netlist.nodes[0].pins.map((pin) => pin.id);

    expect(ids).toContain("q");
    expect(ids).not.toContain("qn");
    expect(ids).not.toContain("set");
  });
});

describe("seq.counter", () => {
  it("counts rising edges and wraps at its modulus", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        rst: { type: "io.switch", params: { value: 1 } },
        counter: { type: "seq.counter", params: { width: 2 } },
      },
      [
        ["clk", "out", "counter", "clk"],
        ["rst", "out", "counter", "rst"],
      ],
    );

    harness.run(20);
    expect(harness.at("counter", "q")).toBe("00");

    harness.set("rst", { value: 0 });
    for (const expected of ["01", "10", "11", "00", "01"]) {
      harness.run(100);
      expect(harness.at("counter", "q")).toBe(expected);
    }
  });

  it("raises `carry` on the terminal count only", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        rst: { type: "io.switch", params: { value: 1 } },
        counter: { type: "seq.counter", params: { width: 2 } },
      },
      [
        ["clk", "out", "counter", "clk"],
        ["rst", "out", "counter", "rst"],
      ],
    );

    harness.run(20);
    harness.set("rst", { value: 0 });

    harness.run(100);
    expect(harness.at("counter", "carry")).toBe("0");
    harness.run(200);
    expect(harness.at("counter", "q")).toBe("11");
    expect(harness.at("counter", "carry")).toBe("1");
    harness.run(100);
    expect(harness.at("counter", "carry")).toBe("0");
  });

  it("counts down when told to", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        rst: { type: "io.switch", params: { value: 1 } },
        counter: {
          type: "seq.counter",
          params: { width: 2, direction: "down" },
        },
      },
      [
        ["clk", "out", "counter", "clk"],
        ["rst", "out", "counter", "rst"],
      ],
    );

    harness.run(20);
    harness.set("rst", { value: 0 });
    harness.run(100);
    expect(harness.at("counter", "q")).toBe("11");
    harness.run(100);
    expect(harness.at("counter", "q")).toBe("10");
  });

  it("loads `d` in preference to counting", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        rst: { type: "io.switch", params: { value: 1 } },
        load: { type: "io.switch", params: { value: 0 } },
        d: { type: "io.switch", params: { width: 3, value: 5 } },
        counter: { type: "seq.counter", params: { width: 3 } },
      },
      [
        ["clk", "out", "counter", "clk"],
        ["rst", "out", "counter", "rst"],
        ["load", "out", "counter", "load"],
        ["d", "out", "counter", "d"],
      ],
    );

    harness.run(20);
    harness.set("rst", { value: 0 });
    harness.set("load", { value: 1 });
    harness.run(100);
    expect(harness.at("counter", "q")).toBe("101");

    harness.set("load", { value: 0 });
    harness.run(100);
    expect(harness.at("counter", "q")).toBe("110");
  });

  it("respects a modulus that is not a power of two", () => {
    const harness = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        rst: { type: "io.switch", params: { value: 1 } },
        counter: {
          type: "seq.counter",
          params: { width: 3, modulus: 3 },
        },
      },
      [
        ["clk", "out", "counter", "clk"],
        ["rst", "out", "counter", "rst"],
      ],
    );

    harness.run(20);
    harness.set("rst", { value: 0 });
    for (const expected of ["001", "010", "000", "001"]) {
      harness.run(100);
      expect(harness.at("counter", "q")).toBe(expected);
    }
  });
});

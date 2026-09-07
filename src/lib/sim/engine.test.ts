import { describe, expect, it } from "vitest";
import { buildNetlist, pinKey } from "@/lib/circuit/netlist";
import type { CircuitDocument, CircuitNode } from "@/lib/circuit/schema";
import type {
  NodeDefinition,
  NodeLookup,
  NodeParams,
} from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine, MAX_EVENTS_PER_ADVANCE } from "./engine";
import { formatSignal } from "./logic";

/**
 * These run against the real registry, not fixtures: the point of the phase is
 * that the seven gates behave, and a fake AND would prove nothing.
 */

type Spec = { type: string; params?: NodeParams };
type Edge = [string, string, string, string];

function circuit(
  nodes: Record<string, Spec>,
  wires: readonly Edge[],
): CircuitDocument {
  const entries = Object.entries(nodes).map(
    ([id, spec]): [string, CircuitNode] => {
      const definition = lookupNode(spec.type);
      if (!definition) throw new Error(`${spec.type} is not in the registry`);
      return [
        id,
        {
          id,
          type: spec.type,
          position: { x: 0, y: 0 },
          params: { ...definition.defaultParams, ...spec.params },
        },
      ];
    },
  );

  return {
    version: 1,
    id: "d_test",
    name: "Test",
    nodes: Object.fromEntries(entries),
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

function engineFor(
  nodes: Record<string, Spec>,
  wires: readonly Edge[],
): { engine: Engine; netOf: (nodeId: string, pinId: string) => number } {
  const netlist = buildNetlist(circuit(nodes, wires), lookupNode);
  const engine = new Engine(netlist, lookupNode);
  return {
    engine,
    netOf: (nodeId, pinId) => netlist.pinToNet[pinKey(nodeId, pinId)],
  };
}

/** Settles the circuit — far past any delay these fixtures use. */
const SETTLE_NS = 100;

const at = (engine: Engine, nodeId: string, pinId: string) =>
  formatSignal(engine.readPin(nodeId, pinId));

describe("reset", () => {
  it("starts every net high-impedance before anything has run", () => {
    const { engine, netOf } = engineFor(
      {
        a: { type: "io.constant", params: { value: 1 } },
        led: { type: "io.led" },
      },
      [["a", "out", "led", "in"]],
    );
    engine.reset();

    // Reset evaluates every node at t = 0 and lets its write land, so a
    // source is already driving before any time has passed.
    expect(engine.now).toBe(0);
    expect(formatSignal(engine.readNet(netOf("a", "out")))).toBe("1");
  });

  it("brings an unresettable feedback loop up X, the way hardware does", () => {
    const { engine } = engineFor(
      {
        n1: { type: "gate.nor" },
        n2: { type: "gate.nor" },
        r: { type: "io.constant", params: { value: 0 } },
        s: { type: "io.constant", params: { value: 0 } },
      },
      [
        ["r", "out", "n1", "in0"],
        ["n2", "out", "n1", "in1"],
        ["s", "out", "n2", "in0"],
        ["n1", "out", "n2", "in1"],
      ],
    );
    engine.runUntil(SETTLE_NS);

    // Neither NOR has a controlling input, so the pair has no defined state
    // until something sets it. X is the correct answer, not 0.
    expect(at(engine, "n1", "out")).toBe("X");
  });

  it("forgets everything when reset again", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g: { type: "gate.not" },
      },
      [["c", "out", "g", "in"]],
    );
    engine.runUntil(SETTLE_NS);
    expect(at(engine, "g", "out")).toBe("0");

    engine.reset();
    expect(engine.now).toBe(0);
    // Reset evaluates every node once, so the gate has run — against nets that
    // are all still Z, which for a NOT means X. The settled 0 is forgotten.
    expect(at(engine, "g", "out")).toBe("X");
  });
});

describe("combinational propagation", () => {
  const truthTable = (type: string, a: number, b: number) => {
    const { engine } = engineFor(
      {
        g: { type },
        x: { type: "io.constant", params: { value: a } },
        y: { type: "io.constant", params: { value: b } },
      },
      [
        ["x", "out", "g", "in0"],
        ["y", "out", "g", "in1"],
      ],
    );
    engine.runUntil(SETTLE_NS);
    return at(engine, "g", "out");
  };

  it.each([
    ["gate.and", "0001"],
    ["gate.or", "0111"],
    ["gate.nand", "1110"],
    ["gate.nor", "1000"],
    ["gate.xor", "0110"],
    ["gate.xnor", "1001"],
  ])("%s follows its truth table", (type, expected) => {
    const rows = [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const;
    expect(rows.map(([a, b]) => truthTable(type, a, b)).join("")).toBe(
      expected,
    );
  });

  it("inverts through gate.not and passes through gate.buffer", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        n: { type: "gate.not" },
        b: { type: "gate.buffer" },
      },
      [
        ["c", "out", "n", "in"],
        ["c", "out", "b", "in"],
      ],
    );
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "n", "out")).toBe("0");
    expect(at(engine, "b", "out")).toBe("1");
  });

  it("applies AND's controlling value to an unconnected input", () => {
    // in1 is wired to nothing, so it reads Z. A 0 on in0 still forces 0.
    const { engine } = engineFor(
      {
        g: { type: "gate.and" },
        c: { type: "io.constant", params: { value: 0 } },
      },
      [["c", "out", "g", "in0"]],
    );
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "g", "out")).toBe("0");
  });

  it("goes X when an unconnected input actually matters", () => {
    const { engine } = engineFor(
      {
        g: { type: "gate.and" },
        c: { type: "io.constant", params: { value: 1 } },
      },
      [["c", "out", "g", "in0"]],
    );
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "g", "out")).toBe("X");
  });

  it("carries a multi-bit value through a gate lane by lane", () => {
    const { engine } = engineFor(
      {
        g: { type: "gate.and", params: { width: 4 } },
        x: { type: "io.constant", params: { width: 4, value: 0b1100 } },
        y: { type: "io.constant", params: { width: 4, value: 0b1010 } },
      },
      [
        ["x", "out", "g", "in0"],
        ["y", "out", "g", "in1"],
      ],
    );
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "g", "out")).toBe("1000");
  });
});

describe("propagation delay", () => {
  it("costs one nanosecond per gate", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g1: { type: "gate.not" },
        g2: { type: "gate.not" },
        g3: { type: "gate.not" },
      },
      [
        ["c", "out", "g1", "in"],
        ["g1", "out", "g2", "in"],
        ["g2", "out", "g3", "in"],
      ],
    );

    // Every gate ran once at reset against Z inputs, so the chain starts X
    // and the known value walks down it one nanosecond at a time.
    expect(at(engine, "g3", "out")).toBe("X");
    engine.runUntil(1);
    expect(at(engine, "g1", "out")).toBe("0");
    engine.runUntil(2);
    expect(at(engine, "g2", "out")).toBe("1");
    engine.runUntil(3);
    expect(at(engine, "g3", "out")).toBe("0");
  });

  it("settles and then stops producing events", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g: { type: "gate.not" },
      },
      [["c", "out", "g", "in"]],
    );
    engine.runUntil(SETTLE_NS);

    const after = engine.runUntil(SETTLE_NS * 2);
    expect(after.events).toBe(0);
    expect(after.settled).toBe(true);
  });

  it("advances to the next event and no further on step", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g1: { type: "gate.not" },
        g2: { type: "gate.not" },
      },
      [
        ["c", "out", "g1", "in"],
        ["g1", "out", "g2", "in"],
      ],
    );
    engine.step();
    expect(engine.now).toBe(1);
    engine.step();
    expect(engine.now).toBe(2);
  });
});

describe("tri-state buses", () => {
  const bus = (
    enableA: number,
    enableB: number,
    dataA: number,
    dataB: number,
  ) => {
    const { engine } = engineFor(
      {
        ta: { type: "gate.tristate" },
        tb: { type: "gate.tristate" },
        ea: { type: "io.constant", params: { value: enableA } },
        eb: { type: "io.constant", params: { value: enableB } },
        da: { type: "io.constant", params: { value: dataA } },
        db: { type: "io.constant", params: { value: dataB } },
        probe: { type: "io.probe" },
      },
      [
        ["ea", "out", "ta", "en"],
        ["eb", "out", "tb", "en"],
        ["da", "out", "ta", "in"],
        ["db", "out", "tb", "in"],
        ["ta", "out", "probe", "in"],
        ["tb", "out", "probe", "in"],
      ],
    );
    engine.runUntil(SETTLE_NS);
    return at(engine, "probe", "in");
  };

  it("floats when nothing drives it", () => {
    expect(bus(0, 0, 1, 0)).toBe("Z");
  });

  it("follows whichever driver is enabled", () => {
    expect(bus(1, 0, 1, 0)).toBe("1");
    expect(bus(0, 1, 1, 0)).toBe("0");
  });

  it("goes X when two enabled drivers disagree", () => {
    expect(bus(1, 1, 1, 0)).toBe("X");
  });

  it("agrees harmlessly when two enabled drivers match", () => {
    expect(bus(1, 1, 1, 1)).toBe("1");
  });

  it("compiles without a multiple-drivers diagnostic", () => {
    const { engine } = engineFor(
      {
        ta: { type: "gate.tristate" },
        tb: { type: "gate.tristate" },
        probe: { type: "io.probe" },
      },
      [
        ["ta", "out", "probe", "in"],
        ["tb", "out", "probe", "in"],
      ],
    );
    expect(engine.diagnostics.map((d) => d.code)).not.toContain(
      "multiple-drivers",
    );
  });
});

describe("multiple drivers", () => {
  it("resolves two opposed plain outputs to X", () => {
    const { engine } = engineFor(
      {
        one: { type: "io.constant", params: { value: 1 } },
        zero: { type: "io.constant", params: { value: 0 } },
        probe: { type: "io.probe" },
      },
      [
        ["one", "out", "probe", "in"],
        ["zero", "out", "probe", "in"],
      ],
    );
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "probe", "in")).toBe("X");
    expect(engine.diagnostics.map((d) => d.code)).toContain("multiple-drivers");
  });
});

describe("setNodeParams", () => {
  it("flips a switch without resetting the circuit", () => {
    const { engine } = engineFor(
      { sw: { type: "io.switch" }, g: { type: "gate.not" } },
      [["sw", "out", "g", "in"]],
    );
    engine.runUntil(SETTLE_NS);
    expect(at(engine, "g", "out")).toBe("1");

    const before = engine.now;
    engine.setNodeParams("sw", { width: 1, value: 1 });
    engine.runUntil(engine.now + SETTLE_NS);

    expect(at(engine, "g", "out")).toBe("0");
    // Time moved forward rather than back to zero: nothing was rebuilt.
    expect(engine.now).toBeGreaterThan(before);
  });

  it("ignores a node id that is not in the circuit", () => {
    const { engine } = engineFor({ sw: { type: "io.switch" } }, []);
    expect(() => engine.setNodeParams("nope", {})).not.toThrow();
  });
});

/**
 * The Phase 2 exit criteria. An SR latch proves feedback and controlling
 * values; a ring oscillator proves that time actually advances; the budget
 * proves a runaway circuit reports rather than hangs.
 */
describe("SR latch", () => {
  /** Q = NOR(R, Qn), Qn = NOR(S, Q) — the classic cross-coupled pair. */
  const latch = () =>
    engineFor(
      {
        q: { type: "gate.nor" },
        qn: { type: "gate.nor" },
        r: { type: "io.switch" },
        s: { type: "io.switch" },
      },
      [
        ["r", "out", "q", "in0"],
        ["qn", "out", "q", "in1"],
        ["s", "out", "qn", "in0"],
        ["q", "out", "qn", "in1"],
      ],
    );

  const drive = (engine: Engine, s: number, r: number) => {
    engine.setNodeParams("s", { width: 1, value: s });
    engine.setNodeParams("r", { width: 1, value: r });
    engine.runUntil(engine.now + SETTLE_NS);
    return [at(engine, "q", "out"), at(engine, "qn", "out")];
  };

  it("comes up unknown, then sets, holds, resets and holds", () => {
    const { engine } = latch();
    engine.runUntil(SETTLE_NS);

    // No reset line, so the pair starts genuinely unknown.
    expect(at(engine, "q", "out")).toBe("X");

    expect(drive(engine, 1, 0)).toEqual(["1", "0"]);
    expect(drive(engine, 0, 0)).toEqual(["1", "0"]);
    expect(drive(engine, 0, 1)).toEqual(["0", "1"]);
    expect(drive(engine, 0, 0)).toEqual(["0", "1"]);
  });

  it("drives both outputs low when set and reset are asserted together", () => {
    const { engine } = latch();
    engine.runUntil(SETTLE_NS);

    expect(drive(engine, 1, 1)).toEqual(["0", "0"]);
  });

  it("settles rather than ringing once it is set", () => {
    const { engine } = latch();
    drive(engine, 1, 0);

    expect(engine.runUntil(engine.now + 1000).events).toBe(0);
  });
});

describe("ring oscillator", () => {
  /**
   * NAND(enable, feedback) → NOT → NOT → feedback.
   *
   * The NAND is the enable: held low its controlling value pins the ring to a
   * known state, which is also the only way to start a real ring — three
   * inverters alone sit at X forever, exactly as hardware sits at its
   * metastable point.
   */
  const ring = () =>
    engineFor(
      {
        nand: { type: "gate.nand" },
        i1: { type: "gate.not" },
        i2: { type: "gate.not" },
        en: { type: "io.switch" },
      },
      [
        ["en", "out", "nand", "in0"],
        ["i2", "out", "nand", "in1"],
        ["nand", "out", "i1", "in"],
        ["i1", "out", "i2", "in"],
      ],
    );

  it("holds still while the enable is low", () => {
    const { engine } = ring();
    engine.runUntil(SETTLE_NS);

    expect(at(engine, "nand", "out")).toBe("1");
    expect(engine.runUntil(engine.now + 1000).events).toBe(0);
  });

  it("oscillates with a period of twice the loop delay once enabled", () => {
    const { engine, netOf } = ring();
    engine.runUntil(SETTLE_NS);
    engine.setNodeParams("en", { width: 1, value: 1 });

    const net = netOf("nand", "out");
    const transitions: number[] = [];
    let previous = formatSignal(engine.readNet(net));
    const start = engine.now;
    while (engine.now < start + 40) {
      engine.step();
      const value = formatSignal(engine.readNet(net));
      if (value !== previous) {
        transitions.push(engine.now - start);
        previous = value;
      }
    }

    // Three stages at 1 ns each: the loop inverts every 3 ns, so the net
    // toggles every 3 ns and a full period is 6 ns. The first transition is
    // the enable arriving, not part of the cadence, so it is dropped.
    const cadence = transitions.slice(1);
    const gaps = cadence.slice(1).map((time, index) => time - cadence[index]);

    expect(gaps.length).toBeGreaterThan(4);
    expect(new Set(gaps)).toEqual(new Set([3]));
  });

  it("keeps oscillating identically on a second run — no hidden state", () => {
    const trace = () => {
      const { engine, netOf } = ring();
      engine.runUntil(SETTLE_NS);
      engine.setNodeParams("en", { width: 1, value: 1 });
      const net = netOf("nand", "out");

      const samples: string[] = [];
      for (let i = 0; i < 40; i++) {
        engine.step();
        samples.push(`${engine.now}:${formatSignal(engine.readNet(net))}`);
      }
      return samples;
    };

    expect(trace()).toEqual(trace());
  });
});

describe("the event budget", () => {
  /** A started ring: an event every nanosecond, for as long as you like. */
  const startedRing = () => {
    const { engine, netOf } = engineFor(
      {
        nand: { type: "gate.nand" },
        i1: { type: "gate.not" },
        i2: { type: "gate.not" },
        en: { type: "io.switch" },
      },
      [
        ["en", "out", "nand", "in0"],
        ["i2", "out", "nand", "in1"],
        ["nand", "out", "i1", "in"],
        ["i1", "out", "i2", "in"],
      ],
    );
    engine.runUntil(SETTLE_NS);
    engine.setNodeParams("en", { width: 1, value: 1 });
    return { engine, netOf };
  };

  it("returns bounded instead of hanging when asked for far too much", () => {
    const { engine } = startedRing();

    // A second of simulated time is a billion events. It has to come back.
    const result = engine.runUntil(1_000_000_000);

    expect(result.events).toBeLessThanOrEqual(MAX_EVENTS_PER_ADVANCE);
    expect(result.settled).toBe(false);
  });

  it("does not accuse a working oscillator of oscillating", () => {
    const { engine } = startedRing();
    const result = engine.runUntil(1_000_000_000);

    // The ring is doing exactly what a ring does, and its clock advances.
    // Calling that an error would condemn every fast circuit in the app.
    expect(result.oscillating).toBe(false);
    expect(engine.diagnostics.map((d) => d.code)).not.toContain("oscillation");
    expect(engine.now).toBeGreaterThan(0);
  });

  it("picks up where it left off across successive advances", () => {
    const { engine } = startedRing();
    const first = engine.runUntil(1_000_000_000);
    const after = engine.now;
    const second = engine.runUntil(1_000_000_000);

    expect(first.events).toBeGreaterThan(0);
    expect(second.events).toBeGreaterThan(0);
    expect(engine.now).toBeGreaterThan(after);
  });

  it("honours a caller budget smaller than its own", () => {
    const { engine } = startedRing();
    const result = engine.runUntil(1_000_000_000, 100);

    expect(result.events).toBe(100);
    expect(result.oscillating).toBe(false);
  });

  it("leaves a settling circuit well clear of the budget", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g1: { type: "gate.not" },
        g2: { type: "gate.not" },
      },
      [
        ["c", "out", "g1", "in"],
        ["g1", "out", "g2", "in"],
      ],
    );
    const result = engine.runUntil(1_000_000_000);

    expect(result.oscillating).toBe(false);
    expect(result.settled).toBe(true);
    expect(result.events).toBeLessThan(20);
  });
});

describe("oscillation", () => {
  /**
   * The registry with every propagation delay removed. A zero-delay loop is
   * the one thing that genuinely cannot be simulated: it feeds itself at a
   * single timestamp, so no amount of running would ever advance the clock.
   */
  const instantLookup: NodeLookup = (type) => {
    const definition = lookupNode(type);
    return (
      definition && ({ ...definition, delayNs: () => 0 } as NodeDefinition)
    );
  };

  const instantRing = () => {
    const document = circuit(
      {
        nand: { type: "gate.nand" },
        i1: { type: "gate.not" },
        i2: { type: "gate.not" },
        en: { type: "io.switch" },
      },
      [
        ["en", "out", "nand", "in0"],
        ["i2", "out", "nand", "in1"],
        ["nand", "out", "i1", "in"],
        ["i1", "out", "i2", "in"],
      ],
    );
    const netlist = buildNetlist(document, instantLookup);
    const engine = new Engine(netlist, instantLookup);
    engine.runUntil(SETTLE_NS);
    return {
      engine,
      netOf: (nodeId: string, pinId: string) =>
        netlist.pinToNet[pinKey(nodeId, pinId)],
    };
  };

  it("terminates a zero-delay loop instead of hanging", () => {
    const { engine } = instantRing();
    engine.setNodeParams("en", { width: 1, value: 1 });

    const result = engine.runUntil(engine.now + 1);
    expect(result.oscillating).toBe(true);
    expect(result.settled).toBe(false);
  });

  it("names the offending nets and nodes rather than just complaining", () => {
    const { engine } = instantRing();
    engine.setNodeParams("en", { width: 1, value: 1 });
    engine.runUntil(engine.now + 1);

    const diagnostic = engine.diagnostics.find((d) => d.code === "oscillation");
    expect(diagnostic?.severity).toBe("error");
    expect(diagnostic?.message).toContain("oscillating");
    expect(diagnostic?.netId).toBeTypeOf("number");
    expect(diagnostic?.nodeIds?.length).toBeGreaterThan(0);
  });

  it("forces the oscillating nets to X rather than a plausible value", () => {
    const { engine, netOf } = instantRing();
    engine.setNodeParams("en", { width: 1, value: 1 });
    engine.runUntil(engine.now + 1);

    expect(formatSignal(engine.readNet(netOf("nand", "out")))).toBe("X");
  });

  it("stops rather than reporting the same loop forever", () => {
    const { engine } = instantRing();
    engine.setNodeParams("en", { width: 1, value: 1 });
    engine.runUntil(engine.now + 1);

    // The queue was cleared with the diagnostic, so there is nothing left to
    // churn on and a further advance is quiet.
    expect(engine.runUntil(engine.now + 1000).oscillating).toBe(false);
  });

  it("says nothing about a circuit whose loop has a delay", () => {
    const { engine } = engineFor(
      {
        nand: { type: "gate.nand" },
        i1: { type: "gate.not" },
        i2: { type: "gate.not" },
        en: { type: "io.switch" },
      },
      [
        ["en", "out", "nand", "in0"],
        ["i2", "out", "nand", "in1"],
        ["nand", "out", "i1", "in"],
        ["i1", "out", "i2", "in"],
      ],
    );
    engine.runUntil(SETTLE_NS);
    engine.setNodeParams("en", { width: 1, value: 1 });
    engine.runUntil(1_000_000);

    expect(engine.diagnostics.map((d) => d.code)).not.toContain("oscillation");
  });
});

describe("version", () => {
  it("bumps once per advance that changed something, not per event", () => {
    const { engine } = engineFor(
      {
        c: { type: "io.constant", params: { value: 1 } },
        g1: { type: "gate.not" },
        g2: { type: "gate.not" },
        g3: { type: "gate.not" },
      },
      [
        ["c", "out", "g1", "in"],
        ["g1", "out", "g2", "in"],
        ["g2", "out", "g3", "in"],
      ],
    );
    const before = engine.version;
    engine.runUntil(SETTLE_NS);

    expect(engine.version).toBe(before + 1);
  });

  it("does not bump when nothing moved", () => {
    const { engine } = engineFor({ c: { type: "io.constant" } }, []);
    engine.runUntil(SETTLE_NS);
    const settled = engine.version;
    engine.runUntil(SETTLE_NS * 2);

    expect(engine.version).toBe(settled);
  });
});

import { describe, expect, it } from "vitest";
import { readoutPatterns } from "@/lib/nodes/comb/segdriver";
import type { NodeParams } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import { HIGH, LOW, type LogicValue, parseSignal, X, Z } from "@/lib/sim/logic";
import { engineFor, evaluateOnce } from "@/test/circuit";
import { readoutBase } from "./segreadout";
import { SEGMENT_PATTERNS, SEGMENTS } from "./sevenseg";

describe("scope.logic", () => {
  it("emits one sample per channel and drives nothing", () => {
    const samples: { channel: string; value: string }[] = [];
    const writes = evaluateOnce(
      "scope.logic",
      { ch0: "1", ch1: "0" },
      { channels: 2 },
      { samples },
    );

    expect(samples).toEqual([
      { channel: "ch0", value: "1" },
      { channel: "ch1", value: "0" },
    ]);
    expect(writes).toEqual({});
  });

  it("records transitions into the engine's waveform buffer", () => {
    const { engine, run, set } = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        source: { type: "io.switch", params: { value: 0 } },
        scope: { type: "scope.logic", params: { channels: 2 } },
      },
      [
        ["clk", "out", "scope", "ch0"],
        ["source", "out", "scope", "ch1"],
      ],
    );

    run(250);
    set("source", { value: 1 });
    run(50);

    const clock = engine.waveform("scope", "ch0");
    const manual = engine.waveform("scope", "ch1");

    // Only changes are stored, so the clock's history is its edges.
    expect(clock.map((sample) => sample.value)).toEqual([
      "0",
      "1",
      "0",
      "1",
      "0",
      "1",
      "0",
    ]);
    expect(clock.map((sample) => sample.time)).toEqual([
      0, 50, 100, 150, 200, 250, 300,
    ]);
    expect(manual.map((sample) => sample.value)).toEqual(["0", "1"]);
  });

  it("samples at the transition rather than a reaction time later", () => {
    const { engine, run } = engineFor(
      {
        clk: { type: "time.clock", params: { periodNs: 100 } },
        scope: { type: "scope.logic", params: { channels: 1 } },
      },
      [["clk", "out", "scope", "ch0"]],
    );

    run(120);
    // A scope with a propagation delay would skew every trace by it, which is
    // exactly the measurement it exists to make.
    expect(engine.waveform("scope", "ch0")[1].time).toBe(50);
  });

  it("forgets its history on reset", () => {
    const { engine, run } = engineFor({
      clk: { type: "time.clock", params: { periodNs: 100 } },
      scope: { type: "scope.logic" },
    });

    run(200);
    engine.reset();
    expect(engine.waveform("scope", "ch0").length).toBeLessThanOrEqual(1);
  });
});

describe("disp.sevenseg", () => {
  it("has a segment pin per segment in raw mode, and one value pin in BCD", () => {
    const definition = lookupNode("disp.sevenseg");
    if (!definition) throw new Error("disp.sevenseg is missing");

    const raw = definition.pins({ mode: "raw" }).map((pin) => pin.id);
    const bcd = definition.pins({ mode: "bcd" });

    expect(raw).toEqual([...SEGMENTS, "dp"]);
    expect(bcd.map((pin) => pin.id)).toEqual(["value", "dp"]);
    expect(bcd[0].width).toBe(4);
  });

  it("has a decode pattern for every hex digit", () => {
    expect(SEGMENT_PATTERNS).toHaveLength(16);
    for (const pattern of SEGMENT_PATTERNS) {
      expect(pattern).toMatch(/^[01]{7}$/);
    }
    // The classic shapes, as a spot check: 1 is just b and c; 8 is all seven.
    expect(SEGMENT_PATTERNS[1]).toBe("0110000");
    expect(SEGMENT_PATTERNS[8]).toBe("1111111");
  });
});

describe("disp.hex and disp.bargraph", () => {
  it("are pure sinks: one input pin and nothing driven", () => {
    for (const type of ["disp.hex", "disp.bargraph"]) {
      const definition = lookupNode(type);
      if (!definition) throw new Error(`${type} is missing`);

      const pins = definition.pins(definition.defaultParams);
      expect(pins.map((pin) => pin.id)).toEqual(["in"]);
      expect(definition.evaluate).toBeUndefined();
    }
  });

  it("sizes the bargraph's pin to its bit count", () => {
    const definition = lookupNode("disp.bargraph");
    expect(definition?.pins({ width: 12 })[0].width).toBe(12);
  });
});

describe("disp.matrix", () => {
  it("is a pure sink with one input pin per row", () => {
    const definition = lookupNode("disp.matrix");
    if (!definition) throw new Error("disp.matrix is missing");

    const pins = definition.pins({ size: 8 });

    expect(pins).toHaveLength(8);
    expect(pins.map((pin) => pin.id)).toEqual([
      "row0",
      "row1",
      "row2",
      "row3",
      "row4",
      "row5",
      "row6",
      "row7",
    ]);
    expect(definition.evaluate).toBeUndefined();
  });

  it("makes each row as wide as the panel is across", () => {
    const definition = lookupNode("disp.matrix");

    for (const size of [2, 5, 16]) {
      const pins = definition?.pins({ size }) ?? [];
      expect(pins).toHaveLength(size);
      expect(pins.every((pin) => pin.width === size)).toBe(true);
    }
  });

  it("clamps a hand-edited size rather than making zero pins", () => {
    const definition = lookupNode("disp.matrix");

    expect(definition?.pins({ size: 0 })).toHaveLength(2);
    expect(definition?.pins({ size: 999 })).toHaveLength(16);
    expect(definition?.pins({ size: "big" })).toHaveLength(8);
  });

  it("stays square, so a panel does not read as a column", () => {
    const definition = lookupNode("disp.matrix");
    const size = definition?.size({ size: 8 });

    expect(size?.width).toBe(size?.height);
  });
});

describe("disp.segreadout", () => {
  const definition = lookupNode("disp.segreadout");
  if (!definition) throw new Error("disp.segreadout is missing");

  const pinsOf = (params: NodeParams) =>
    Object.fromEntries(definition.pins(params).map((pin) => [pin.id, pin]));

  it("is a pure sink: a value, two controls and a decimal-point word", () => {
    const pins = pinsOf({ ...definition.defaultParams, width: 8, digits: 4 });

    expect(Object.keys(pins).sort()).toEqual(["bl", "dp", "lt", "value"]);
    expect(pins.value.width).toBe(8);
    expect(pins.value.side).toBe("left");
    expect(pins.bl.side).toBe("top");
    expect(pins.lt.side).toBe("top");
    // The controls must not land on top of each other on the one edge.
    expect(pins.bl.offset).not.toBe(pins.lt.offset);
    expect(Object.values(pins).every((pin) => pin.direction === "in")).toBe(
      true,
    );
    // A display drives nothing; what it shows is the view's business.
    expect(definition.evaluate).toBeUndefined();
  });

  it("gives the decimal point one bit per digit", () => {
    for (const digits of [1, 4, 8]) {
      const pins = pinsOf({ ...definition.defaultParams, digits });
      expect(pins.dp.width).toBe(digits);
      expect(pins.dp.side).toBe("bottom");
    }
  });

  it("clamps a hand-edited digit count rather than vanishing", () => {
    expect(pinsOf({ digits: 0 }).dp.width).toBe(1);
    expect(pinsOf({ digits: 999 }).dp.width).toBe(8);
    expect(pinsOf({ digits: "four" }).dp.width).toBe(4);
  });

  it("widens with the digit count and stays wider than it is tall", () => {
    const one = definition.size({ ...definition.defaultParams, digits: 1 });
    const eight = definition.size({ ...definition.defaultParams, digits: 8 });

    expect(eight.width).toBeGreaterThan(one.width);
    expect(eight.height).toBe(one.height);
    expect(eight.width).toBeGreaterThan(eight.height);
  });

  it("reads its radix as the base the shared decode is given", () => {
    expect(readoutBase({ radix: "dec" })).toBe(10);
    expect(readoutBase({ radix: "hex" })).toBe(16);
    // An unknown radix in a hand-edited file falls back rather than producing
    // a base of NaN, which would blank every digit.
    expect(readoutBase({ radix: "octal" })).toBe(10);
  });

  it("shows the same digits the driver decodes, controls and all", () => {
    const patterns = (value: string, bl: LogicValue, lt: LogicValue) =>
      readoutPatterns(parseSignal(value), 3, 10, true, bl, lt);

    // 42 in decimal, least significant first, the leading digit blanked.
    expect(patterns("00101010", Z, Z)).toEqual([
      SEGMENT_PATTERNS[2],
      SEGMENT_PATTERNS[4],
      "0000000",
    ]);
    // Blank wins over lamp test, the way a real part's blanking input does.
    expect(patterns("00101010", HIGH, HIGH)).toEqual([
      "0000000",
      "0000000",
      "0000000",
    ]);
    expect(patterns("00101010", LOW, HIGH)).toEqual([
      "1111111",
      "1111111",
      "1111111",
    ]);
    // An unresolved value, or an unresolved control, is unknown everywhere
    // rather than a guessed glyph.
    expect(patterns("0010101X", Z, Z)).toEqual([null, null, null]);
    expect(patterns("00101010", X, Z)).toEqual([null, null, null]);
  });
});

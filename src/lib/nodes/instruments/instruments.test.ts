import { describe, expect, it } from "vitest";
import { lookupNode } from "@/lib/nodes/registry";
import { engineFor, evaluateOnce } from "@/test/circuit";
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

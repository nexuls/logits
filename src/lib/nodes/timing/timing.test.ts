import { describe, expect, it } from "vitest";
import { engineFor, evaluateOnce, outputOf } from "@/test/circuit";

/**
 * The timing family is about *when*, so most of it is tested through a running
 * engine rather than a truth table: a clock that produces the right level and
 * the wrong period would pass every static check.
 */

describe("time.clock", () => {
  it("runs a square wave at the configured period", () => {
    const { at, run } = engineFor({
      clk: { type: "time.clock", params: { periodNs: 100, dutyCycle: 50 } },
    });

    // It comes up low (`startHigh` is off) and flips every half period.
    expect(at("clk", "out")).toBe("0");
    run(50);
    expect(at("clk", "out")).toBe("1");
    run(50);
    expect(at("clk", "out")).toBe("0");
    run(50);
    expect(at("clk", "out")).toBe("1");
  });

  it("honours the duty cycle", () => {
    const { at, run } = engineFor({
      clk: {
        type: "time.clock",
        params: { periodNs: 100, dutyCycle: 20, startHigh: true },
      },
    });

    expect(at("clk", "out")).toBe("1");
    run(19);
    expect(at("clk", "out")).toBe("1");
    run(2);
    expect(at("clk", "out")).toBe("0");
    // The low half is the remaining 80 ns.
    run(78);
    expect(at("clk", "out")).toBe("0");
    run(2);
    expect(at("clk", "out")).toBe("1");
  });

  it("holds low while `en` is low and restarts cleanly when it returns", () => {
    const { at, run, set } = engineFor(
      {
        gate: { type: "io.switch", params: { value: 0 } },
        clk: { type: "time.clock", params: { periodNs: 100 } },
      },
      [["gate", "out", "clk", "en"]],
    );

    run(500);
    expect(at("clk", "out")).toBe("0");

    set("gate", { value: 1 });
    // The half period starts when the clock re-evaluates, a couple of
    // nanoseconds after the switch is flipped.
    run(60);
    expect(at("clk", "out")).toBe("1");
  });

  it("schedules itself rather than waiting for an input", () => {
    const scheduled: number[] = [];
    evaluateOnce(
      "time.clock",
      {},
      { periodNs: 100, dutyCycle: 50 },
      { scheduled },
    );

    expect(scheduled).toEqual([50]);
  });
});

describe("time.oneshot", () => {
  it("emits one pulse of the configured width per rising edge", () => {
    const { at, run, set } = engineFor(
      {
        trigger: { type: "io.switch", params: { value: 0 } },
        pulse: { type: "time.oneshot", params: { widthNs: 40 } },
      },
      [["trigger", "out", "pulse", "in"]],
    );

    run(10);
    expect(at("pulse", "out")).toBe("0");

    set("trigger", { value: 1 });
    run(5);
    expect(at("pulse", "out")).toBe("1");
    run(30);
    expect(at("pulse", "out")).toBe("1");
    run(20);
    expect(at("pulse", "out")).toBe("0");

    // A falling edge does nothing in `rising` mode.
    set("trigger", { value: 0 });
    run(5);
    expect(at("pulse", "out")).toBe("0");
  });

  it("re-triggers rather than ignoring an edge during a pulse", () => {
    const { at, run, set } = engineFor(
      {
        trigger: { type: "io.switch", params: { value: 0 } },
        pulse: { type: "time.oneshot", params: { widthNs: 100, edge: "both" } },
      },
      [["trigger", "out", "pulse", "in"]],
    );

    run(10);
    set("trigger", { value: 1 });
    run(50);
    // Halfway through, a second edge restarts the full 100 ns.
    set("trigger", { value: 0 });
    run(80);
    expect(at("pulse", "out")).toBe("1");
    run(30);
    expect(at("pulse", "out")).toBe("0");
  });
});

describe("time.delay", () => {
  it("reports its delay as the node's reaction time", () => {
    const definition = { delayNs: 250 };
    const { at, run, set } = engineFor(
      {
        source: { type: "io.switch", params: { value: 0 } },
        lag: { type: "time.delay", params: definition },
      },
      [["source", "out", "lag", "in"]],
    );

    run(500);
    expect(at("lag", "out")).toBe("0");

    set("source", { value: 1 });
    run(240);
    expect(at("lag", "out")).toBe("0");
    run(20);
    expect(at("lag", "out")).toBe("1");
  });

  it("passes the value through, normalising a floating input to X", () => {
    expect(outputOf("time.delay", { in: "1" })).toBe("1");
    expect(outputOf("time.delay", {})).toBe("X");
  });
});

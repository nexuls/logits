import { describe, expect, it } from "vitest";
import { buildNetlist } from "@/lib/circuit/netlist";
import { keypadKeys, NO_KEY } from "@/lib/nodes/io/keypad";
import { lookupNode } from "@/lib/nodes/registry";
import { Engine } from "@/lib/sim/engine";
import { fromBits } from "@/lib/sim/logic";
import { getExample } from "./index";

/**
 * The calculator is the one shipped circuit whose *behaviour* is the point, so
 * it is driven the way a user drives it — keys pressed and released on the
 * pad — and read off the same registers the displays are wired to. A wiring
 * mistake anywhere in the datapath shows up here as a wrong number.
 */

const CLOCK_NS = 100;

function calculator() {
  const example = getExample("ex_calculator");
  if (!example) throw new Error("the calculator example failed to load");

  const document = example.document;
  const engine = new Engine(buildNetlist(document, lookupNode), lookupNode);
  const keypad = document.nodes.kp;
  const keys = keypadKeys(keypad.params);

  /** Press and release one key, holding it long enough to be sampled. */
  function press(label: string) {
    const index = keys.findIndex((key) => key.label === label);
    if (index < 0) throw new Error(`no key "${label}"`);

    engine.setNodeParams(keypad.id, {
      ...keypad.params,
      pressed: index,
      value: keys[index].value,
    });
    engine.runUntil(engine.now + CLOCK_NS * 3);
    engine.setNodeParams(keypad.id, {
      ...keypad.params,
      pressed: NO_KEY,
      value: keys[index].value,
    });
    engine.runUntil(engine.now + CLOCK_NS * 3);
  }

  /** Every key of an expression, then enough clocks for a ×/÷ run to finish. */
  function enter(expression: string) {
    for (const label of expression) press(label);
    engine.runUntil(engine.now + CLOCK_NS * 25);
  }

  const read = (nodeId: string, pinId: string) =>
    fromBits(engine.readPin(nodeId, pinId));

  // Settle the power-on reset before the first key.
  engine.runUntil(CLOCK_NS * 3);

  return {
    engine,
    press,
    enter,
    read,
    a: () => read("reg_a", "q"),
    entry: () => read("reg_e", "q"),
    result: () => read("reg_res", "q"),
    remainder: () => read("reg_rem", "q"),
    error: () => read("ff_err", "q"),
    negative: () => read("ff_neg", "q"),
  };
}

describe("calculator example", () => {
  it("starts cleared", () => {
    const calc = calculator();
    expect(calc.a()).toBe(0);
    expect(calc.entry()).toBe(0);
    expect(calc.result()).toBe(0);
  });

  it("builds a four-digit entry one key at a time", () => {
    const calc = calculator();
    calc.press("1");
    expect(calc.entry()).toBe(1);
    calc.press("2");
    expect(calc.entry()).toBe(12);
    calc.press("3");
    expect(calc.entry()).toBe(123);
    calc.press("4");
    expect(calc.entry()).toBe(1234);
    // A fifth digit would overflow four digits, so it is ignored.
    calc.press("5");
    expect(calc.entry()).toBe(1234);
  });

  it("moves the entry into operand A when an operator is pressed", () => {
    const calc = calculator();
    calc.enter("1234+");
    expect(calc.a()).toBe(1234);
    expect(calc.entry()).toBe(0);
    calc.enter("56");
    expect(calc.entry()).toBe(56);
  });

  it.each([
    ["1234+5678", 6912],
    ["9999+9999", 19998],
    ["0+0", 0],
    ["9876-1234", 8642],
    ["7-7", 0],
    ["12*12", 144],
    ["9999*9999", 99980001],
    ["1234*0", 0],
    ["0*9999", 0],
    ["144/12", 12],
    ["9999/3", 3333],
    ["7/9", 0],
    ["9999/1", 9999],
  ])("computes %s = %i", (expression, expected) => {
    const calc = calculator();
    calc.enter(`${expression}=`);
    expect(calc.result()).toBe(expected);
    expect(calc.error()).toBe(0);
  });

  it("shows a subtraction that goes below zero as a magnitude and a sign", () => {
    const calc = calculator();
    calc.enter("12-3456=");
    expect(calc.result()).toBe(3444);
    expect(calc.negative()).toBe(1);

    calc.enter("C3456-12=");
    expect(calc.result()).toBe(3444);
    expect(calc.negative()).toBe(0);
  });

  it("leaves the remainder of a division", () => {
    const calc = calculator();
    calc.enter("1000/7=");
    expect(calc.result()).toBe(142);
    expect(calc.remainder()).toBe(6);
  });

  it("flags a division by zero instead of showing a number", () => {
    const calc = calculator();
    calc.enter("1234/0=");
    expect(calc.error()).toBe(1);
  });

  it("starts a fresh entry when a digit follows =", () => {
    const calc = calculator();
    calc.enter("12+30=");
    expect(calc.result()).toBe(42);

    calc.enter("7");
    expect(calc.entry()).toBe(7);
    calc.enter("*8=");
    expect(calc.result()).toBe(56);
  });

  it("clears everything with C", () => {
    const calc = calculator();
    calc.enter("99*99=");
    expect(calc.result()).toBe(9801);

    calc.press("C");
    expect(calc.a()).toBe(0);
    expect(calc.entry()).toBe(0);
    expect(calc.result()).toBe(0);
    expect(calc.error()).toBe(0);
  });
});

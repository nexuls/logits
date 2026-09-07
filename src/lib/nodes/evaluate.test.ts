import { describe, expect, it } from "vitest";
import { formatSignal, parseSignal, type Signal, X, Z } from "@/lib/sim/logic";
import type { EvalContext, NodeParams } from "./define";
import { lookupNode, nodeDefinitions } from "./registry";

/**
 * Truth tables for every node that has an `evaluate`, exercised directly
 * rather than through the engine.
 *
 * The engine tests prove the wiring; these prove the logic, including the `X`
 * and `Z` rows a two-value truth table cannot express — which is the whole
 * reason the app is four-valued.
 */

type Writes = Record<string, { value: string; delayNs: number }>;

/**
 * Runs one `evaluate` against fixed input values. `inputs` maps pin id to a
 * signal written MSB-first, the way a value is read off a page.
 */
function evaluate(
  type: string,
  inputs: Record<string, string>,
  params: NodeParams = {},
): Writes {
  const definition = lookupNode(type);
  if (!definition?.evaluate) throw new Error(`${type} has no evaluate`);

  const merged = { ...definition.defaultParams, ...params };
  const pins = definition.pins(merged);
  const writes: Writes = {};

  const context: EvalContext = {
    now: 0,
    params: merged,
    state: {},
    read: (pinId) => {
      const spec = pins.find((pin) => pin.id === pinId);
      if (!spec) throw new Error(`${type} has no pin "${pinId}"`);
      // An input the case does not mention is unconnected, which reads Z.
      const text = inputs[pinId] ?? "Z".repeat(spec.width);
      return parseSignal(text);
    },
    write: (pinId, value: Signal, delayNs = 0) => {
      writes[pinId] = { value: formatSignal(value), delayNs };
    },
    scheduleSelf: () => {},
  };

  definition.evaluate(context);
  return writes;
}

const out = (
  type: string,
  inputs: Record<string, string>,
  params?: NodeParams,
) => evaluate(type, inputs, params).out?.value;

/** Every ordered pair of the four values, as `in0`/`in1` cases. */
const PAIRS = ["0", "1", "X", "Z"].flatMap((a) =>
  ["0", "1", "X", "Z"].map((b) => [a, b] as const),
);

/** The 16 results as one string, rows A = 0/1/X/Z, columns B = 0/1/X/Z. */
const table = (type: string) =>
  PAIRS.map(([a, b]) => out(type, { in0: a, in1: b })).join("");

describe("symmetric gates", () => {
  it.each([
    // 00 01 0X 0Z  10 11 1X 1Z  X0 X1 XX XZ  Z0 Z1 ZX ZZ
    ["gate.and", "0000" + "01XX" + "0XXX" + "0XXX"],
    ["gate.or", "01XX" + "1111" + "X1XX" + "X1XX"],
    ["gate.nand", "1111" + "10XX" + "1XXX" + "1XXX"],
    ["gate.nor", "10XX" + "0000" + "X0XX" + "X0XX"],
    ["gate.xor", "01XX" + "10XX" + "XXXX" + "XXXX"],
    ["gate.xnor", "10XX" + "01XX" + "XXXX" + "XXXX"],
  ])("%s covers all four values on both inputs", (type, expected) => {
    expect(table(type)).toBe(expected);
  });

  it("keeps AND's controlling value across more than two inputs", () => {
    const value = evaluate(
      "gate.and",
      { in0: "X", in1: "Z", in2: "0", in3: "1" },
      { inputs: 4 },
    );
    expect(value.out.value).toBe("0");
  });

  it("folds a wide bus lane by lane", () => {
    expect(out("gate.or", { in0: "0101", in1: "0011" }, { width: 4 })).toBe(
      "0111",
    );
  });
});

describe("unary gates", () => {
  it.each([
    ["gate.not", "0", "1"],
    ["gate.not", "1", "0"],
    ["gate.not", "X", "X"],
    ["gate.not", "Z", "X"],
    ["gate.buffer", "0", "0"],
    ["gate.buffer", "1", "1"],
    ["gate.buffer", "X", "X"],
    ["gate.buffer", "Z", "X"],
  ])("%s of %s is %s", (type, input, expected) => {
    expect(out(type, { in: input })).toBe(expected);
  });

  it("never turns an undriven input into a free 1", () => {
    // The trap a two-valued simulator falls into: NOT of "nothing" is not 1.
    expect(out("gate.not", { in: "Z" })).toBe("X");
  });
});

describe("gate.tristate", () => {
  it.each([
    ["1", "1", "1"],
    ["1", "0", "0"],
    ["1", "X", "X"],
    ["1", "Z", "X"],
    ["0", "1", "Z"],
    ["0", "0", "Z"],
    ["0", "X", "Z"],
  ])("with en=%s and in=%s drives %s", (en, input, expected) => {
    expect(out("gate.tristate", { en, in: input })).toBe(expected);
  });

  it.each(["X", "Z"])("drives X when the enable itself is %s", (en) => {
    // Whether this driver is on is exactly what nobody knows, so the output
    // cannot honestly be Z — that would claim the driver is definitely off.
    expect(out("gate.tristate", { en, in: "1" })).toBe("X");
  });

  it("passes a whole bus through when enabled", () => {
    expect(out("gate.tristate", { en: "1", in: "1010" }, { width: 4 })).toBe(
      "1010",
    );
  });

  it("releases the whole bus when disabled", () => {
    expect(out("gate.tristate", { en: "0", in: "1010" }, { width: 4 })).toBe(
      "ZZZZ",
    );
  });
});

describe("sources", () => {
  it("drives a constant's value", () => {
    expect(out("io.constant", {}, { width: 4, value: 0b1011 })).toBe("1011");
  });

  it("drives a switch's stored position", () => {
    expect(out("io.switch", {}, { width: 1, value: 0 })).toBe("0");
    expect(out("io.switch", {}, { width: 1, value: 1 })).toBe("1");
  });

  it("drives a button high only while it is held", () => {
    expect(out("io.button", {}, { pressed: false })).toBe("0");
    expect(out("io.button", {}, { pressed: true })).toBe("1");
  });

  it("falls back to a default rather than NaN on a hand-edited param", () => {
    expect(out("io.constant", {}, { width: 2, value: "banana" })).toBe("00");
  });
});

describe("sinks", () => {
  it.each(["io.led", "io.probe"])("%s has no evaluate to run", (type) => {
    // A display reads its net through the scene; giving it an evaluate would
    // put UI state inside the engine.
    expect(lookupNode(type)?.evaluate).toBeUndefined();
  });
});

describe("every definition", () => {
  it.each(
    nodeDefinitions.map((d) => [d.type, d] as const),
  )("%s only writes pins it declares as outputs", (_type, definition) => {
    if (!definition.evaluate) return;

    const pins = definition.pins(definition.defaultParams);
    const written = Object.keys(
      evaluate(definition.type, {}, definition.defaultParams),
    );

    for (const pinId of written) {
      const spec = pins.find((pin) => pin.id === pinId);
      expect(spec?.direction).not.toBe("in");
    }
  });

  it.each(
    nodeDefinitions.map((d) => [d.type, d] as const),
  )("%s writes a signal of exactly its pin's width", (_type, definition) => {
    if (!definition.evaluate) return;

    const params = { ...definition.defaultParams, width: 4 };
    const pins = definition.pins(params);
    const writes = evaluate(definition.type, {}, params);

    for (const [pinId, write] of Object.entries(writes)) {
      const spec = pins.find((pin) => pin.id === pinId);
      expect(write.value).toHaveLength(spec?.width ?? -1);
    }
  });

  it.each(
    nodeDefinitions.map((d) => [d.type, d] as const),
  )("%s is deterministic — the same inputs give the same writes", (_type, definition) => {
    if (!definition.evaluate) return;

    const once = evaluate(definition.type, { in: "1", in0: "1", in1: "0" });
    const twice = evaluate(definition.type, { in: "1", in0: "1", in1: "0" });
    expect(once).toEqual(twice);
  });
});

describe("the fixture itself", () => {
  it("treats an unmentioned input as unconnected", () => {
    // Guards the tables above: a Z default is what makes the Z rows real.
    expect(X).not.toBe(Z);
    expect(out("gate.buffer", {})).toBe("X");
  });
});

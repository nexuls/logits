import { defineNode } from "@/lib/nodes/define";
import {
  AND2,
  bitAt,
  combine,
  createSignal,
  fromBits,
  HIGH,
  isKnown,
  LOW,
  type LogicValue,
  OR2,
  type Signal,
  X,
  XOR2,
} from "@/lib/sim/logic";
import { widthOf, widthParam } from "../shared";
import { addSignals, invertSignal, operand } from "./arith";

/**
 * The op codes, in `op` order. Frozen with the pin ids: `op` is three bits in
 * the save format, so re-ordering this list would silently change what every
 * saved circuit computes.
 */
export const ALU_OPS = [
  "add",
  "sub",
  "and",
  "or",
  "xor",
  "not",
  "shl",
  "shr",
] as const;

export const ALU_OP_BITS = 3;

export const aluNode = defineNode({
  type: "comb.alu",
  title: "ALU",
  icon: "alu",
  category: "comb",
  keywords: ["alu", "arithmetic", "logic unit", "add", "subtract", "cpu"],
  defaultParams: { width: 8 },
  paramsSchema: [widthParam()],
  pins: (params) => {
    const width = widthOf(params);
    return [
      { id: "a", name: "A", direction: "in", width, side: "left", offset: 3 },
      { id: "b", name: "B", direction: "in", width, side: "left", offset: 5 },
      {
        id: "op",
        name: "OP",
        direction: "in",
        width: ALU_OP_BITS,
        side: "bottom",
        offset: 5,
      },
      {
        id: "out",
        name: "Y",
        direction: "out",
        width,
        side: "right",
        offset: 2,
      },
      {
        id: "zero",
        name: "Z",
        direction: "out",
        width: 1,
        side: "right",
        offset: 4,
      },
      {
        id: "carry",
        name: "C",
        direction: "out",
        width: 1,
        side: "right",
        offset: 6,
      },
      {
        id: "overflow",
        name: "V",
        direction: "out",
        width: 1,
        side: "right",
        offset: 8,
      },
    ];
  },
  size: () => ({ width: 10, height: 10 }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const a = operand(ctx.read("a"), width);
    const b = operand(ctx.read("b"), width);
    const code = fromBits(ctx.read("op"));

    const result =
      code === null
        ? {
            out: createSignal(width, X),
            carry: X as LogicValue,
            overflow: X as LogicValue,
          }
        : compute(ALU_OPS[code] ?? "add", a, b, width);

    ctx.write("out", result.out);
    ctx.write("carry", createSignal(1, result.carry));
    ctx.write("overflow", createSignal(1, result.overflow));
    ctx.write("zero", createSignal(1, zeroFlag(result.out)));
  },
});

type Result = { out: Signal; carry: LogicValue; overflow: LogicValue };

function compute(
  op: (typeof ALU_OPS)[number],
  a: Signal,
  b: Signal,
  width: number,
): Result {
  switch (op) {
    case "add":
      return arithmetic(a, b, width, false);
    case "sub":
      // a - b is a + ~b + 1 in two's complement, so subtraction is the adder
      // with one operand inverted rather than a second ripple loop.
      return arithmetic(a, b, width, true);
    case "and":
      return logic(combine([a, b], width, AND2));
    case "or":
      return logic(combine([a, b], width, OR2));
    case "xor":
      return logic(combine([a, b], width, XOR2));
    case "not":
      return logic(invertSignal(a, width));
    case "shl": {
      const out = createSignal(width, LOW);
      for (let i = 1; i < width; i++) out[i] = bitAt(a, i - 1);
      // The bit shifted off the top is the carry, which is what makes a shift
      // chainable across two of these.
      return { out, carry: bitAt(a, width - 1), overflow: LOW };
    }
    default: {
      const out = createSignal(width, LOW);
      for (let i = 0; i < width - 1; i++) out[i] = bitAt(a, i + 1);
      return { out, carry: bitAt(a, 0), overflow: LOW };
    }
  }
}

function arithmetic(
  a: Signal,
  b: Signal,
  width: number,
  subtract: boolean,
): Result {
  const operandB = subtract ? invertSignal(b, width) : b;
  const { sum, carryOut } = addSignals(
    a,
    operandB,
    subtract ? HIGH : LOW,
    width,
  );

  // Signed overflow: the operands agreed on sign and the result disagrees.
  const signA = bitAt(a, width - 1);
  const signB = bitAt(operandB, width - 1);
  const signOut = bitAt(sum, width - 1);
  const overflow =
    signA === X || signB === X || signOut === X
      ? X
      : signA === signB && signOut !== signA
        ? HIGH
        : LOW;

  return { out: sum, carry: carryOut, overflow };
}

function logic(out: Signal): Result {
  return { out, carry: LOW, overflow: LOW };
}

function zeroFlag(out: Signal): LogicValue {
  if (!isKnown(out)) return X;
  return out.every((bit) => bit === LOW) ? HIGH : LOW;
}

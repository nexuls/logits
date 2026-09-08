import {
  AND2,
  apply2,
  bitAt,
  combine,
  createSignal,
  LOW,
  type LogicValue,
  OR2,
  type Signal,
  X,
  XOR2,
  Z,
} from "@/lib/sim/logic";

/**
 * Ripple-carry addition in four-valued logic, shared by `comb.adder` and the
 * ALU's ADD and SUB.
 *
 * Bit by bit through the same tables the gates use rather than through
 * `fromBits`, so the controlling values survive: `0 + X` carries `0` when the
 * other input is `0`, and only the lanes that genuinely cannot be resolved
 * come out `X`. Converting to a number first would smear one unknown bit
 * across the whole result.
 */
export function addSignals(
  a: Signal,
  b: Signal,
  carryIn: LogicValue,
  width: number,
): { sum: Signal; carryOut: LogicValue } {
  const sum = createSignal(width, X);
  let carry = carryIn;

  for (let i = 0; i < width; i++) {
    const ai = bitAt(a, i);
    const bi = bitAt(b, i);
    const half = apply2(XOR2, ai, bi);

    sum[i] = apply2(XOR2, half, carry);
    carry = apply2(OR2, apply2(AND2, ai, bi), apply2(AND2, half, carry));
  }

  return { sum, carryOut: carry };
}

/** Bitwise NOT, four-valued, without going through a gate definition. */
export function invertSignal(value: Signal, width: number): Signal {
  return combine([value], width, AND2, true);
}

/**
 * Normalises an operand: a floating lane is unknown to arithmetic, exactly as
 * it is to a gate.
 */
export function operand(value: Signal, width: number): Signal {
  return combine([value], width, AND2);
}

/**
 * A carry-in nobody has wired reads `Z`, and the useful reading of "no carry
 * wired in" is "no carry" — the same reasoning that makes an unwired `en`
 * mean enabled. A genuinely contended carry stays `X`.
 */
export function carryInput(value: LogicValue): LogicValue {
  return value === Z ? LOW : value;
}

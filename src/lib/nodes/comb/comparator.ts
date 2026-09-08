import { boolParam, defineNode } from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type Signal,
  X,
} from "@/lib/sim/logic";
import { widthOf, widthParam } from "../shared";

/**
 * Magnitude comparison, optionally two's complement.
 *
 * Unlike the adder, this one is all-or-nothing on unknowns: `lt`/`eq`/`gt` are
 * a property of the whole word, so a single unresolved bit in either operand
 * genuinely leaves all three unknown rather than only some lanes.
 */
export const comparatorNode = defineNode({
  type: "comb.comparator",
  title: "Comparator",
  icon: "comparator",
  category: "comb",
  keywords: ["comparator", "compare", "less", "greater", "equal", "arithmetic"],
  defaultParams: { width: 4, signed: false },
  paramsSchema: [
    widthParam(),
    {
      key: "signed",
      label: "Signed",
      kind: "bool",
      hint: "Reads both operands as two's complement.",
    },
  ],
  pins: (params) => {
    const width = widthOf(params);
    return [
      { id: "a", name: "A", direction: "in", width, side: "left", offset: 2 },
      { id: "b", name: "B", direction: "in", width, side: "left", offset: 4 },
      {
        id: "lt",
        name: "A<B",
        direction: "out",
        width: 1,
        side: "right",
        offset: 2,
      },
      {
        id: "eq",
        name: "A=B",
        direction: "out",
        width: 1,
        side: "right",
        offset: 3,
      },
      {
        id: "gt",
        name: "A>B",
        direction: "out",
        width: 1,
        side: "right",
        offset: 4,
      },
    ];
  },
  size: () => ({ width: 8, height: 6 }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const signed = boolParam(ctx.params, "signed", false);
    const a = numericValue(ctx.read("a"), width, signed);
    const b = numericValue(ctx.read("b"), width, signed);

    const flag = (predicate: boolean) =>
      createSignal(1, a === null || b === null ? X : predicate ? HIGH : LOW);

    ctx.write("lt", flag((a ?? 0) < (b ?? 0)));
    ctx.write("eq", flag(a === b));
    ctx.write("gt", flag((a ?? 0) > (b ?? 0)));
  },
});

/** Null when any bit is `X` or floating — those words have no magnitude. */
export function numericValue(
  signal: Signal,
  width: number,
  signed: boolean,
): number | null {
  const unsigned = fromBits(signal.subarray(0, width));
  if (unsigned === null) return null;
  const span = 2 ** width;
  return signed && unsigned >= span / 2 ? unsigned - span : unsigned;
}

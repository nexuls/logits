import { defineNode, stringParam } from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type LogicValue,
  toBits,
  X,
  Z,
} from "@/lib/sim/logic";
import { detectEdge, NO_LEVEL } from "../edges";
import { boundedParam, spread, widthOf, widthParam } from "../shared";

const BODY_WIDTH = 8;

type CounterState = {
  /** null is X: the count before a reset, or after an unresolvable edge. */
  value: number | null;
  clk: LogicValue | typeof NO_LEVEL;
};

/**
 * A synchronous up/down counter with an asynchronous reset and a parallel
 * load. `carry` is high on the terminal count — the last value before the
 * wrap — so chaining two of them is `carry` into the next stage's `en`.
 *
 * The count is held as a number rather than a `Signal`: it is a number that
 * wraps, and keeping it as bits would mean re-deriving it on every edge.
 */
export const counterNode = defineNode({
  type: "seq.counter",
  title: "Counter",
  icon: "counter",
  category: "seq",
  keywords: ["counter", "count", "up", "down", "divider", "sequential"],
  defaultParams: { width: 4, direction: "up", modulus: 0 },
  paramsSchema: [
    widthParam(),
    {
      key: "direction",
      label: "Direction",
      kind: "select",
      options: [
        { value: "up", label: "Up" },
        { value: "down", label: "Down" },
      ],
    },
    {
      key: "modulus",
      label: "Modulus",
      kind: "int",
      min: 0,
      max: 2 ** 32,
      hint: "0 counts the full range of the bit width.",
    },
  ],
  pins: (params) => {
    const width = widthOf(params);
    const offsets = spread(3, BODY_WIDTH);

    return [
      { id: "d", name: "D", direction: "in", width, side: "left", offset: 3 },
      ...["rst", "en", "load"].map((id, index) => ({
        id,
        name: id.toUpperCase(),
        direction: "in" as const,
        width: 1,
        side: "top" as const,
        offset: offsets[index],
      })),
      {
        id: "clk",
        name: "CLK",
        direction: "in",
        width: 1,
        side: "bottom",
        offset: BODY_WIDTH / 2,
      },
      { id: "q", name: "Q", direction: "out", width, side: "right", offset: 2 },
      {
        id: "carry",
        name: "CO",
        direction: "out",
        width: 1,
        side: "right",
        offset: 4,
      },
    ];
  },
  size: () => ({ width: BODY_WIDTH, height: 6 }),
  createState: () => ({ value: null, clk: NO_LEVEL }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const span = 2 ** width;
    const modulus = clampModulus(
      boundedParam(ctx.params, "modulus", 0, 0, span),
      span,
    );
    const down = stringParam(ctx.params, "direction", "up") === "down";
    const state = ctx.state as CounterState;

    const rst = ctx.read("rst")[0] as LogicValue;
    // An unwired reset reads Z, which must not clear the counter — only an
    // actually asserted or actually contended reset does anything.
    if (rst === HIGH) state.value = 0;
    else if (rst !== LOW && rst !== Z) state.value = null;

    const clk = ctx.read("clk")[0] as LogicValue;
    const edge = detectEdge(state.clk, clk, "rising");
    state.clk = clk;

    if (rst !== HIGH && edge !== "none") {
      if (edge === "unknown") {
        state.value = null;
      } else {
        const en = ctx.read("en")[0] as LogicValue;
        const load = ctx.read("load")[0] as LogicValue;

        if (en === X) state.value = null;
        else if (en !== LOW) {
          if (load === HIGH) {
            const loaded = fromBits(ctx.read("d"));
            state.value = loaded === null ? null : loaded % modulus;
          } else if (load !== LOW && load !== Z) state.value = null;
          else if (state.value !== null) {
            state.value = (state.value + (down ? modulus - 1 : 1)) % modulus;
          }
        }
      }
    }

    const value = state.value;
    ctx.write(
      "q",
      value === null ? createSignal(width, X) : toBits(value, width),
    );
    ctx.write(
      "carry",
      createSignal(
        1,
        value === null
          ? X
          : (down ? value === 0 : value === modulus - 1)
            ? HIGH
            : LOW,
      ),
    );
  },
});

/** A modulus of 0, 1 or one past the width's range all mean "the full range". */
function clampModulus(modulus: number, span: number): number {
  return modulus < 2 || modulus > span ? span : modulus;
}

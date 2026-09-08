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
  docs: `
A synchronous up/down counter with an asynchronous reset and a parallel load.

## Behaviour

On each rising clock edge the count moves by one, in the direction
**Direction** sets, and appears on \`Q\`. Everything happens on the one edge —
this is not a ripple counter, so all the output bits change together.

**Modulus** is where it wraps. Leave it at 0 to count the full range of the bit
width (0…2ⁿ−1); set it to 10 for a decade counter, 60 for seconds, and so on.

\`CO\` (carry out) is high on the *terminal* count — the last value before the
wrap, which is modulus−1 counting up and 0 counting down. That is the pin that
makes counters chainable: wire one stage's \`CO\` into the next stage's \`EN\`
and the second only advances on the cycle the first rolls over.

| Pin | Effect |
| :-- | :-- |
| \`RST\` | High clears the count to 0 immediately, without waiting for a clock edge. Beats everything else |
| \`LOAD\` | High at the edge loads \`D\` instead of counting |
| \`EN\` | Low at the edge holds the count. Unwired reads as enabled |
| \`D\` | The value \`LOAD\` writes |

An unwired \`RST\` floats and does nothing — only a reset actually asserted
clears the counter.

## Typical uses

- A program counter: \`LOAD\` and \`D\` give you the jump, \`EN\` gives you the
  stall.
- A clock divider — feed \`time.clock\` in and take a slower square wave off
  a high bit of \`Q\`.
- Driving \`mem.rom\`'s address for a sequencer or a waveform table.
- Feeding \`disp.sevenseg\` in BCD mode with **Modulus** at 10, for a digit
  that rolls over the way a real one does.

## On the canvas

1. Place it and wire \`CLK\` from \`time.clock\`.
2. Put \`Q\` into \`io.probe\` or \`disp.hex\` to read the count.
3. Set **Bit width** and **Modulus** in the inspector before wiring, since
   changing the width re-derives the pins.
4. Wire \`RST\` from an \`io.button\` to zero it by hand.

The count is simulation state — a reset, or a structural edit, clears it.`,
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

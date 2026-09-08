import { boolParam, defineNode, type ParamSpec } from "@/lib/nodes/define";
import {
  createSignal,
  HIGH,
  isKnownBit,
  LOW,
  type LogicValue,
  toBits,
  X,
} from "@/lib/sim/logic";
import { boundedParam, stack, stackHeight } from "../shared";

const MIN_BITS = 1;
const MAX_BITS = 4;

const OUTPUT_BITS_PARAM: ParamSpec = {
  key: "outputBits",
  label: "Output bits",
  kind: "int",
  min: MIN_BITS,
  max: MAX_BITS,
  hint: "Inputs are 2 to this power.",
};

/**
 * The inverse of the decoder: which input is high, as a number.
 *
 * `priority` decides what a non-one-hot input means. A priority encoder takes
 * the highest index that is high and does not care what is below it — so an
 * unknown *below* the winner is harmless, and one *above* it is not. A plain
 * encoder assumes exactly one input is high and answers X when that is not
 * true, rather than inventing a winner.
 */
export const encoderNode = defineNode({
  type: "comb.encoder",
  docs: `
The inverse of the decoder: it reports **which input is high**, as a number on
\`Y\`.

## Behaviour

**Output bits** sets the width of \`Y\`; there are 2 to that power inputs.
\`V\` (valid) is high when the answer means something and low when no input is
asserted — without it, "nothing is high" and "input 0 is high" would both read
as zero.

**Priority** decides what a non-one-hot input means:

- **On** (a priority encoder): the *highest-numbered* high input wins and
  anything below it is ignored. An unknown below the winner is harmless; one
  above it is not, since it might have been the winner, so that gives \`X\`.
- **Off** (a plain encoder): exactly one input is expected to be high. Two at
  once, or any unresolved input, gives \`X\` on both \`Y\` and \`V\` rather
  than inventing a winner.

## Typical uses

- **Interrupt arbitration** — one request line per device, priority on, and
  \`Y\` is the highest-priority pending request with \`V\` saying whether
  there is one at all.
- Reading a keypad or a bank of switches as a number.
- Finding the position of the most significant set bit — a normaliser's first
  step.
- Compressing a one-hot state vector back to a state number.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Encoder",
  icon: "encoder",
  category: "comb",
  keywords: ["encoder", "priority", "index", "one hot", "combinational"],
  defaultParams: { outputBits: 2, priority: true },
  paramsSchema: [
    OUTPUT_BITS_PARAM,
    { key: "priority", label: "Priority", kind: "bool" },
  ],
  pins: (params) => {
    const bits = boundedParam(params, "outputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const height = stackHeight(lines);

    return [
      ...stack(
        Array.from({ length: lines }, (_, index) => ({
          id: `in${index}`,
          name: `D${index}`,
          direction: "in" as const,
          width: 1,
        })),
        "left",
        height,
      ),
      {
        id: "out",
        name: "Y",
        direction: "out",
        width: bits,
        side: "right",
        offset: height / 2 - 1,
      },
      {
        id: "valid",
        name: "V",
        direction: "out",
        width: 1,
        side: "right",
        offset: height / 2 + 1,
      },
    ];
  },
  size: (params) => ({
    width: 6,
    height: stackHeight(
      2 ** boundedParam(params, "outputBits", 2, MIN_BITS, MAX_BITS),
    ),
  }),
  evaluate: (ctx) => {
    const bits = boundedParam(ctx.params, "outputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const priority = boolParam(ctx.params, "priority", true);

    const levels = Array.from(
      { length: lines },
      (_, index) => ctx.read(`in${index}`)[0] as LogicValue,
    );

    const index = priority ? scanPriority(levels) : scanOneHot(levels);

    ctx.write(
      "out",
      index === null || index < 0
        ? createSignal(bits, index === null ? X : LOW)
        : toBits(index, bits),
    );
    ctx.write(
      "valid",
      createSignal(1, index === null ? X : index < 0 ? LOW : HIGH),
    );
  },
});

/** null is "unknowable"; -1 is "nothing is asserted". */
function scanPriority(levels: readonly LogicValue[]): number | null {
  for (let index = levels.length - 1; index >= 0; index--) {
    const level = levels[index];
    if (level === HIGH) return index;
    // An unresolved input above every high one might have been the winner.
    if (!isKnownBit(level)) return null;
  }
  return -1;
}

function scanOneHot(levels: readonly LogicValue[]): number | null {
  let found = -1;
  for (const [index, level] of levels.entries()) {
    if (!isKnownBit(level)) return null;
    if (level !== HIGH) continue;
    if (found >= 0) return null;
    found = index;
  }
  return found;
}

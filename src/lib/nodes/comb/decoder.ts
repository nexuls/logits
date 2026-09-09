import { defineNode, type ParamSpec } from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type LogicValue,
  X,
} from "@/lib/sim/logic";
import { boundedParam, stack, stackHeight } from "../shared";

const MIN_BITS = 1;
const MAX_BITS = 5;

const INPUT_BITS_PARAM: ParamSpec = {
  key: "inputBits",
  label: "Address bits",
  kind: "int",
  min: MIN_BITS,
  max: MAX_BITS,
  hint: "Outputs are 2 to this power, one-hot.",
};

/** One-hot decode of `in`, gated by `en`. `en` unwired reads Z and enables. */
export const decoderNode = defineNode({
  type: "comb.decoder",
  docs: `
Turns a binary address into a **one-hot** set of outputs: exactly one line
high, the one \`A\` names.

## Behaviour

**Address bits** sets the input width; there are 2 to that power outputs. Two
address bits give \`Y0\`…\`Y3\`, and an address of 2 raises \`Y2\` with the
rest low.

\`EN\` gates the whole thing. Held low, every output is low regardless of the
address. Unwired it floats and the decoder is enabled, which is the useful
default. An \`EN\` that cannot be resolved puts \`X\` on every line, and so
does an unresolvable address.

## Typical uses

- **Memory and device selection** — the outputs are one-hot by construction,
  which is exactly what a bank of \`gate.tristate\` enables needs if the
  shared bus is never to be contended.
- Driving a 7-segment display's segments from a value, when the decoding is
  the exercise. \`disp.sevenseg\` in BCD mode does it for you when it is not.
- One-of-n indicator lamps — a decoder into a row of \`io.led\`.
- Micro-code control: a state number in, one control line per state out.

\`comb.encoder\` is the inverse: one-hot in, a number out.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Decoder",
  shortTitle: "DEC",
  icon: "decoder",
  view: "block",
  category: "comb",
  keywords: ["decoder", "one hot", "address", "select", "combinational"],
  defaultParams: { inputBits: 2 },
  paramsSchema: [INPUT_BITS_PARAM],
  pins: (params) => {
    const bits = boundedParam(params, "inputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const height = stackHeight(lines);

    return [
      {
        id: "in",
        name: "A",
        direction: "in",
        width: bits,
        side: "left",
        offset: height / 2,
      },
      {
        id: "en",
        name: "EN",
        direction: "in",
        width: 1,
        side: "top",
        offset: 3,
      },
      ...stack(
        Array.from({ length: lines }, (_, index) => ({
          id: `out${index}`,
          name: `Y${index}`,
          direction: "out" as const,
          width: 1,
        })),
        "right",
        height,
      ),
    ];
  },
  size: (params) => ({
    width: 6,
    height: stackHeight(
      2 ** boundedParam(params, "inputBits", 2, MIN_BITS, MAX_BITS),
    ),
  }),
  evaluate: (ctx) => {
    const bits = boundedParam(ctx.params, "inputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const enable = ctx.read("en")[0] as LogicValue;
    const address = fromBits(ctx.read("in"));

    const level = (index: number): LogicValue => {
      if (enable === LOW) return LOW;
      if (enable === X) return X;
      if (address === null) return X;
      return index === address ? HIGH : LOW;
    };

    for (let index = 0; index < lines; index++) {
      ctx.write(`out${index}`, createSignal(1, level(index)));
    }
  },
});

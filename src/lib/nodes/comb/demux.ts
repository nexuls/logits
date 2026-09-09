import { defineNode } from "@/lib/nodes/define";
import { AND2, combine, createSignal, fromBits, LOW, X } from "@/lib/sim/logic";
import { stack, stackHeight, widthOf, widthParam } from "../shared";
import { SELECT_PARAM, selectBitsOf } from "./mux";

/**
 * The mux run backwards: `in` reaches the output `sel` names, and every other
 * output is driven low rather than left floating — a demux is a router, not a
 * bank of tri-state drivers.
 */
export const demuxNode = defineNode({
  type: "comb.demux",
  docs: `
A demultiplexer: \`A\` reaches the one output that \`SEL\` names, and every
other output is driven **low**.

## Behaviour

The multiplexer run backwards. **Select bits** decides how many outputs there
are — 2 to that power — and **Bit width** how wide each one is.

The unselected outputs are actively driven low rather than left floating: this
is a router, not a bank of tri-state drivers. If you want a shared bus where
only one source drives at a time, that is \`gate.tristate\` with a
\`comb.decoder\` on the enables.

A \`SEL\` that cannot be resolved puts \`X\` on **every** output, since the
signal could have gone anywhere.

## Typical uses

- Steering a write into one of several registers.
- Distributing a clock or a strobe to the one destination that should see it.
- With \`A\` tied high, it is a decoder — which is what \`comb.decoder\` is,
  built for that job.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Demultiplexer",
  shortTitle: "DEMUX",
  icon: "demux",
  view: "block",
  category: "comb",
  keywords: ["demux", "demultiplexer", "route", "distribute", "combinational"],
  defaultParams: { selectBits: 1, width: 1 },
  paramsSchema: [SELECT_PARAM, widthParam()],
  pins: (params) => {
    const width = widthOf(params);
    const lines = 2 ** selectBitsOf(params);
    const height = stackHeight(lines);

    return [
      {
        id: "in",
        name: "A",
        direction: "in",
        width,
        side: "left",
        offset: height / 2,
      },
      {
        id: "sel",
        name: "SEL",
        direction: "in",
        width: selectBitsOf(params),
        side: "bottom",
        offset: 3,
      },
      ...stack(
        Array.from({ length: lines }, (_, index) => ({
          id: `out${index}`,
          name: `Y${index}`,
          direction: "out" as const,
          width,
        })),
        "right",
        height,
      ),
    ];
  },
  size: (params) => ({
    width: 6,
    height: stackHeight(2 ** selectBitsOf(params)),
  }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const lines = 2 ** selectBitsOf(ctx.params);
    const selected = fromBits(ctx.read("sel"));
    const value = combine([ctx.read("in")], width, AND2);

    for (let index = 0; index < lines; index++) {
      ctx.write(
        `out${index}`,
        selected === null
          ? createSignal(width, X)
          : index === selected
            ? value
            : createSignal(width, LOW),
      );
    }
  },
});

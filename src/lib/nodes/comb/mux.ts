import {
  defineNode,
  type NodeParams,
  type ParamSpec,
} from "@/lib/nodes/define";
import { AND2, combine, createSignal, fromBits, X } from "@/lib/sim/logic";
import {
  boundedParam,
  stack,
  stackHeight,
  widthOf,
  widthParam,
} from "../shared";

export const MIN_SELECT_BITS = 1;
export const MAX_SELECT_BITS = 4;

/** Shared by the mux and the demux, whose `sel` pin means the same thing. */
export const SELECT_PARAM: ParamSpec = {
  key: "selectBits",
  label: "Select bits",
  kind: "int",
  min: MIN_SELECT_BITS,
  max: MAX_SELECT_BITS,
  hint: "Data lines are 2 to this power.",
};

export function selectBitsOf(params: NodeParams): number {
  return boundedParam(
    params,
    "selectBits",
    1,
    MIN_SELECT_BITS,
    MAX_SELECT_BITS,
  );
}

/**
 * `sel` goes on the bottom edge beside the clock pins rather than on the left
 * with the data: it selects rather than flows through, and putting it with the
 * data inputs makes a 16-way mux unreadable.
 */
export const muxNode = defineNode({
  type: "comb.mux",
  docs: `
A multiplexer: \`SEL\` picks one of the data inputs and copies it to \`Y\`.

## Behaviour

**Select bits** decides how many data lines there are — 2 to that power, so 1
bit gives \`D0\`/\`D1\`, 2 bits gives four, 4 bits gives sixteen. **Bit width**
is how wide each of those lines is, so a mux can switch whole buses, not just
single bits.

\`SEL\` sits on the bottom edge rather than with the data on the left: it
selects rather than flows through, and mixing it in with sixteen data pins
would make the element unreadable.

A \`SEL\` nobody can resolve does not pick a *probable* input — the output is
\`X\`. Whatever is on the unselected inputs is ignored entirely, unknowns
included.

## Typical uses

- Choosing between two sources for a register's \`D\` — the classic
  "count or load" decision.
- An ALU operand select, or a bypass path in a pipeline.
- Building arbitrary logic from a truth table: wire the function's inputs to
  \`SEL\` and tie each data line to the constant that row should produce. Any
  n-input function fits an n-select mux with no gates at all.
- Time-division multiplexing a display: drive \`SEL\` from a counter to scan
  digits.

\`comb.demux\` is the inverse — one input, routed out to the line \`SEL\`
names.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Multiplexer",
  shortTitle: "MUX",
  icon: "mux",
  category: "comb",
  keywords: ["mux", "multiplexer", "select", "switch", "combinational"],
  defaultParams: { selectBits: 1, width: 1 },
  paramsSchema: [SELECT_PARAM, widthParam()],
  pins: (params) => {
    const width = widthOf(params);
    const lines = 2 ** selectBitsOf(params);
    const height = stackHeight(lines);

    return [
      ...stack(
        Array.from({ length: lines }, (_, index) => ({
          id: `in${index}`,
          name: `D${index}`,
          direction: "in" as const,
          width,
        })),
        "left",
        height,
      ),
      {
        id: "sel",
        name: "SEL",
        direction: "in",
        width: selectBitsOf(params),
        side: "bottom",
        offset: 3,
      },
      {
        id: "out",
        name: "Y",
        direction: "out",
        width,
        side: "right",
        offset: height / 2,
      },
    ];
  },
  size: (params) => ({
    width: 6,
    height: stackHeight(2 ** selectBitsOf(params)),
  }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const selected = fromBits(ctx.read("sel"));

    // A select line nobody can resolve does not pick a "probably" input: the
    // output is unknown, which is exactly what X is for.
    ctx.write(
      "out",
      selected === null
        ? createSignal(width, X)
        : combine([ctx.read(`in${selected}`)], width, AND2),
    );
  },
});

import { defineNode } from "@/lib/nodes/define";
import { AND2, combine, HIGH, LOW, type LogicValue, X } from "@/lib/sim/logic";
import { widthOf, widthParam } from "../shared";
import { fill, invert, loadBits, storeBits } from "./shared";

/**
 * A transparent (level-sensitive) latch: `q` follows `d` for as long as `en`
 * is high, and holds the last value when it falls.
 *
 * Unlike the clocked nodes, an unresolved `en` is not "enabled": `en` is the
 * latch's only control, so a floating one means nobody can say whether the
 * stored value or the input is on `q`, and that is X.
 */
export const latchNode = defineNode({
  type: "seq.latch",
  docs: `
A transparent, level-sensitive latch: \`Q\` follows \`D\` for as long as
\`EN\` is high, and holds the last value when \`EN\` falls.

## Behaviour

The difference from \`seq.dff\` is the whole lesson. A flip-flop samples at an
*instant*; a latch is a *window*. While \`EN\` is high this element is a wire —
every wobble on \`D\`, glitches included, reaches \`Q\`. Only the falling edge
of \`EN\` freezes it.

That makes latches cheaper and faster but far harder to reason about, which is
why synchronous design uses flip-flops almost everywhere.

Unlike the clocked parts, an unresolved \`EN\` here is **not** treated as
enabled. \`EN\` is this latch's only control, so a floating one means nobody
can say whether \`Q\` is showing the stored value or the input — and that is
\`X\`.

\`Q̅\` is \`Q\` inverted, derived rather than stored.

## Typical uses

- Holding a value briefly while something downstream reads it.
- Building a flip-flop from two latches in series on opposite phases of the
  clock — the master–slave arrangement, and the best way to see what
  edge-triggering actually is.
- Demonstrating the hazard: drive \`D\` from a gate whose inputs race, hold
  \`EN\` high, and the glitch appears on \`Q\`. Swap in a \`seq.dff\` and it
  does not.

## On the canvas

1. Place it, wire \`D\` from your data and \`EN\` from a switch or a clock.
2. With \`EN\` high, toggle \`D\` and watch \`Q\` follow immediately.
3. Drop \`EN\` low and toggle \`D\` again — \`Q\` no longer moves.

Stored values are simulation state: a reset, or any structural edit such as
changing **Bit width**, clears them.`,
  title: "D latch",
  shortTitle: "LATCH",
  icon: "latch",
  category: "seq",
  keywords: ["latch", "transparent", "level", "d latch", "sequential"],
  defaultParams: { width: 1 },
  paramsSchema: [widthParam()],
  pins: (params) => {
    const width = widthOf(params);
    return [
      { id: "d", name: "D", direction: "in", width, side: "left", offset: 2 },
      {
        id: "en",
        name: "EN",
        direction: "in",
        width: 1,
        side: "top",
        offset: 3,
      },
      { id: "q", name: "Q", direction: "out", width, side: "right", offset: 2 },
      {
        id: "qn",
        name: "Q̅",
        direction: "out",
        width,
        side: "right",
        offset: 4,
      },
    ];
  },
  size: () => ({ width: 6, height: 6 }),
  createState: () => ({ q: [] }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const state = ctx.state as { q: number[] };
    const enable = ctx.read("en")[0] as LogicValue;

    let q = loadBits(state.q, width);
    if (enable === HIGH) q = combine([ctx.read("d")], width, AND2);
    else if (enable !== LOW) q = fill(width, X);

    state.q = storeBits(q);
    ctx.write("q", q);
    ctx.write("qn", invert(q, width));
  },
});

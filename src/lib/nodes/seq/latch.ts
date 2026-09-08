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
  title: "D latch",
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

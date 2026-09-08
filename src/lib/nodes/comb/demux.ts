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
  title: "Demultiplexer",
  icon: "demux",
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

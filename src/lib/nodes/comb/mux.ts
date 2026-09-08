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
  title: "Multiplexer",
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

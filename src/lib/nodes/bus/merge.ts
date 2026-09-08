import { defineNode } from "@/lib/nodes/define";
import { bitAt, createSignal, X } from "@/lib/sim/logic";
import { stack, stackHeight } from "../shared";
import { GROUPS_PARAM, groupOffsets, parseGroups, totalWidth } from "./groups";

/** The inverse of `bus.split`: narrow lanes back onto one bus. */
export const mergeNode = defineNode({
  type: "bus.merge",
  title: "Merge",
  icon: "merge",
  category: "bus",
  keywords: ["merge", "bus", "join", "concat", "bits", "structure"],
  defaultParams: { groups: "1,1,1,1" },
  paramsSchema: [GROUPS_PARAM],
  pins: (params) => {
    const groups = parseGroups(params.groups);
    const height = stackHeight(groups.length);

    return [
      ...stack(
        groups.map((size, index) => ({
          id: `in${index}`,
          name: `A${index}`,
          direction: "in" as const,
          width: size,
        })),
        "left",
        height,
      ),
      {
        id: "out",
        name: "OUT",
        direction: "out",
        width: totalWidth(groups),
        side: "right",
        offset: height / 2,
      },
    ];
  },
  size: (params) => ({
    width: 4,
    height: stackHeight(parseGroups(params.groups).length),
  }),
  evaluate: (ctx) => {
    const groups = parseGroups(ctx.params.groups);
    const offsets = groupOffsets(groups);
    const bus = createSignal(totalWidth(groups), X);

    for (const [index, size] of groups.entries()) {
      const lane = ctx.read(`in${index}`);
      for (let bit = 0; bit < size; bit++) {
        bus[offsets[index] + bit] = bitAt(lane, bit);
      }
    }

    ctx.write("out", bus);
  },
});

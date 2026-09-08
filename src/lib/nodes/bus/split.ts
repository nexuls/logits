import { defineNode } from "@/lib/nodes/define";
import { bitAt, createSignal, X } from "@/lib/sim/logic";
import { stack, stackHeight } from "../shared";
import { GROUPS_PARAM, groupOffsets, parseGroups, totalWidth } from "./groups";

/** Fans one bus out into narrower ones, least significant group first. */
export const splitNode = defineNode({
  type: "bus.split",
  title: "Split",
  icon: "split",
  category: "bus",
  keywords: ["split", "bus", "fan out", "slice", "bits", "structure"],
  defaultParams: { groups: "1,1,1,1" },
  paramsSchema: [GROUPS_PARAM],
  pins: (params) => {
    const groups = parseGroups(params.groups);
    const height = stackHeight(groups.length);

    return [
      {
        id: "in",
        name: "IN",
        direction: "in",
        width: totalWidth(groups),
        side: "left",
        offset: height / 2,
      },
      ...stack(
        groups.map((size, index) => ({
          id: `out${index}`,
          name: `Y${index}`,
          direction: "out" as const,
          width: size,
        })),
        "right",
        height,
      ),
    ];
  },
  size: (params) => ({
    width: 4,
    height: stackHeight(parseGroups(params.groups).length),
  }),
  evaluate: (ctx) => {
    const groups = parseGroups(ctx.params.groups);
    const offsets = groupOffsets(groups);
    const bus = ctx.read("in");

    for (const [index, size] of groups.entries()) {
      const lane = createSignal(size, X);
      for (let bit = 0; bit < size; bit++) {
        // Bit for bit, with no normalisation: a split is wiring, so a lane
        // that is floating upstream stays floating downstream.
        lane[bit] = bitAt(bus, offsets[index] + bit);
      }
      ctx.write(`out${index}`, lane);
    }
  },
});

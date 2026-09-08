import { defineNode } from "@/lib/nodes/define";
import { bitAt, createSignal, X } from "@/lib/sim/logic";
import { stack, stackHeight } from "../shared";
import { GROUPS_PARAM, groupOffsets, parseGroups, totalWidth } from "./groups";

/** Fans one bus out into narrower ones, least significant group first. */
export const splitNode = defineNode({
  type: "bus.split",
  docs: `
Fans one bus out into narrower ones, least significant group first.

## Behaviour

**Groups** is a comma-separated list of lane counts, least significant first.
\`4,4\` cuts an 8-bit bus into two nibbles; \`1,1,1,1\` fans a nibble out to
single bits; \`1,7\` peels off bit 0 and leaves the rest as a 7-bit bus.

The input width is the **sum** of the groups rather than a separate setting, so
a split and the merge that undoes it cannot be configured into disagreeing.

It is wiring, not logic: bits pass through untouched, with no normalisation at
all. A lane floating at \`Z\` upstream stays \`Z\` downstream, and an \`X\`
stays an \`X\`. Nothing here has a propagation delay worth thinking about.

## Typical uses

- Taking one bit out of a counter to drive an \`io.led\` or a clock divider.
- Splitting an instruction word into opcode and operand fields.
- Feeding \`disp.sevenseg\` in BCD mode from a wider value, four bits per
  digit — \`4,4\` for two digits.
- Reordering or re-grouping bits, by splitting and merging back differently.

\`bus.merge\` is the inverse.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
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

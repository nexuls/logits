import { defineNode } from "@/lib/nodes/define";
import { bitAt, createSignal, X } from "@/lib/sim/logic";
import { stack, stackHeight } from "../shared";
import { GROUPS_PARAM, groupOffsets, parseGroups, totalWidth } from "./groups";

/** The inverse of `bus.split`: narrow lanes back onto one bus. */
export const mergeNode = defineNode({
  type: "bus.merge",
  docs: `
Joins narrow lanes back onto one bus, least significant group first.

## Behaviour

**Groups** is a comma-separated list of lane counts, least significant first,
in the same format \`bus.split\` uses. \`4,4\` takes two nibbles and produces
an 8-bit bus with \`A0\` in the low half; \`1,1,1,1\` gathers four single bits
into a nibble.

The output width is the sum of the groups. Like the split, this is wiring: bits
are placed on the bus exactly as they arrive, with \`Z\` and \`X\` carried
through rather than normalised.

## Typical uses

- Assembling a word from individual \`io.switch\` bits to feed a probe or an
  adder.
- Concatenating an opcode and an operand into an instruction word for
  \`mem.rom\`.
- Zero- or sign-extending: merge the value with a constant in the high group.
- Round-tripping with \`bus.split\` to reorder bits — split with one grouping,
  rewire, merge with another.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Merge",
  icon: "merge",
  view: "block",
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

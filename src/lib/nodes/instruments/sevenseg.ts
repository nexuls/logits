import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { stack, stackHeight } from "../shared";

/** Segment pin ids, in the order a datasheet lists them. Save format. */
export const SEGMENTS = ["a", "b", "c", "d", "e", "f", "g"] as const;

/**
 * Which segments each hex digit lights, in `SEGMENTS` order.
 *
 * Here rather than in the view because it is the display's behaviour, not its
 * appearance: `bcd` mode decodes with this table, and a test can check the
 * decode without rendering anything.
 */
export const SEGMENT_PATTERNS: readonly string[] = [
  "1111110", // 0
  "0110000", // 1
  "1101101", // 2
  "1111001", // 3
  "0110011", // 4
  "1011011", // 5
  "1011111", // 6
  "1110000", // 7
  "1111111", // 8
  "1111011", // 9
  "1110111", // A
  "0011111", // b
  "1001110", // C
  "0111101", // d
  "1001111", // E
  "1000111", // F
];

export function isBcd(params: NodeParams): boolean {
  return stringParam(params, "mode", "raw") === "bcd";
}

/**
 * A seven-segment digit, in two shapes.
 *
 * `raw` gives one pin per segment, which is the part you wire a decoder to.
 * `bcd` gives a single 4-bit `value` and does the decoding itself, which is
 * the part you use when the decoder is not the point of the exercise. Both are
 * the same node because the display is the same display — the mode only
 * changes which pins it presents, which is what `pins(params)` is for.
 */
export const sevenSegmentNode = defineNode({
  type: "disp.sevenseg",
  title: "7-segment",
  icon: "seven-segment",
  category: "instruments",
  keywords: ["seven segment", "7 segment", "digit", "display", "numeral"],
  defaultParams: { mode: "raw", commonAnode: false },
  view: "seven-segment",
  paramsSchema: [
    {
      key: "mode",
      label: "Mode",
      kind: "select",
      options: [
        { value: "raw", label: "Segment pins" },
        { value: "bcd", label: "BCD value" },
      ],
    },
    {
      key: "commonAnode",
      label: "Common anode",
      kind: "bool",
      hint: "Segments light on 0 rather than 1.",
    },
  ],
  pins: (params) => {
    const height = stackHeight(isBcd(params) ? 2 : SEGMENTS.length);

    return [
      ...stack(
        isBcd(params)
          ? [
              {
                id: "value",
                name: "VAL",
                direction: "in" as const,
                width: 4,
              },
            ]
          : SEGMENTS.map((id) => ({
              id,
              name: id.toUpperCase(),
              direction: "in" as const,
              width: 1,
            })),
        "left",
        height,
      ),
      {
        id: "dp",
        name: "DP",
        direction: "in",
        width: 1,
        side: "bottom",
        offset: 5,
      },
    ];
  },
  size: (params) => ({
    width: 10,
    height: stackHeight(isBcd(params) ? 2 : SEGMENTS.length),
  }),
});

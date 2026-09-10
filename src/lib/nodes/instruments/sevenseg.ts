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
  docs: `
A seven-segment digit, in two shapes: raw segment pins, or a BCD value it
decodes itself.

## Behaviour

**Mode** changes which pins the display presents.

- **Segment pins** — one input per segment, \`A\` through \`G\`, in datasheet
  order. This is the part you wire a decoder to, and the mode to use when
  building the decoder is the exercise.
- **BCD value** — a single 4-bit \`VAL\` input, decoded internally to the
  usual patterns for 0–9 and A–F. Use it when the decoding is not the point.

\`DP\` is the decimal point, on the bottom edge, in both modes.

**Colour** is cosmetic and affects nothing electrically — the same LED colours
the lamp and the matrix panel offer, so a display can be matched to the rest of
a panel.

**Common anode** inverts the sense of every segment input, so segments light on
\`0\` rather than \`1\` — which is how a common-anode part is wired in
hardware, and a good source of confusion worth being able to reproduce.

Segments driven by an unresolved signal are marked as unknown rather than being
shown lit or dark, so a half-wired display is distinguishable from a working
one showing an odd glyph.

## Typical uses

- The output of a decade counter (\`seq.counter\` with **Modulus** 10) in BCD
  mode.
- Two or more digits fed from \`bus.split\` with groups of \`4,4\`.
- A hand-built BCD-to-seven-segment decoder in segment-pin mode — seven
  Boolean functions of four inputs, and the classic Karnaugh-map exercise.
- A hexadecimal readout, since the BCD decoding covers A–F too.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "7-segment",
  icon: "seven-segment",
  category: "instruments",
  keywords: ["seven segment", "7 segment", "digit", "display", "numeral"],
  defaultParams: { mode: "raw", commonAnode: false, color: "red" },
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
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
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

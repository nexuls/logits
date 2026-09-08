import { defineNode } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

const MAX_BARS = 16;

/** One lamp per bit, least significant at the bottom. */
export const bargraphNode = defineNode({
  type: "disp.bargraph",
  docs: `
A column of lamps, one per bit, least significant at the bottom.

## Behaviour

**Bit width** sets how many bars there are, up to 16. Each is lit for a \`1\`,
dark for a \`0\`, and marked when the bit is unknown or floating — a marker
rather than only a colour, so it stays legible without relying on hue.

**Colour** is cosmetic and affects nothing electrically.

It is a row of \`io.led\` in one element, and the reason to prefer it is that
one wire replaces eight: wire the bus straight in rather than splitting it.

## Typical uses

- Watching a counter or register in binary while it runs.
- A one-hot decoder's outputs, where the moving single lit bar is the point.
- A shift register, where the pattern visibly walks up or down the column.
- Any bus where the *shape* of the value matters more than its number — for
  the number, use \`io.probe\` or \`disp.hex\`.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Bargraph",
  icon: "bargraph",
  category: "instruments",
  keywords: ["bargraph", "bar", "leds", "display", "bits", "meter"],
  defaultParams: { width: 8, color: "green" },
  view: "bargraph",
  paramsSchema: [
    widthParam("One lamp per bit.", MAX_BARS),
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
      ],
    },
  ],
  pins: (params) => [
    {
      id: "in",
      name: "IN",
      direction: "in",
      width: widthOf(params, MAX_BARS),
      side: "left",
      offset: 3,
    },
  ],
  size: () => ({ width: 6, height: 6 }),
});

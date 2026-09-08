import { defineNode } from "@/lib/nodes/define";

export const ledNode = defineNode({
  type: "io.led",
  docs: `
A single-bit indicator. It drives nothing — it only shows what the net it is
wired to is doing.

## Behaviour

| Input | Shown |
| :-: | :-- |
| 1 | Lit, in the chosen colour |
| 0 | Dark |
| X | Marked as unknown — a marker, not just a colour, so it is legible without relying on hue |
| Z | Dark and marked as floating |

**Colour** is cosmetic and affects nothing electrically. It is worth using
consistently across a circuit — one colour per clock domain, or red for error
flags — because that is what makes a board of twenty LEDs readable at a
glance.

The LED has no \`evaluate\` at all: it is a pure sink that reads its net
directly, so adding a row of them costs the simulation nothing.

## Typical uses

- Watching a counter's output bits, one LED per bit — or \`disp.bargraph\`,
  which is exactly that in one element.
- Flagging a comparator's \`A=B\`, an ALU's zero flag, a carry out.
- Confirming a clock is running before debugging anything downstream of it.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "LED",
  icon: "lamp",
  category: "io",
  keywords: ["led", "lamp", "light", "output", "sink", "indicator"],
  defaultParams: { color: "green" },
  view: "lamp",
  paramsSchema: [
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
  pins: () => [
    {
      id: "in",
      name: "IN",
      direction: "in",
      width: 1,
      side: "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 4, height: 4 }),
});

import { defineNode } from "@/lib/nodes/define";

export const ledNode = defineNode({
  type: "io.led",
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

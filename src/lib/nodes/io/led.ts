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
      kind: "select",
      options: [
        { value: "green", label: "Green" },
        { value: "red", label: "Red" },
        { value: "amber", label: "Amber" },
        { value: "blue", label: "Blue" },
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

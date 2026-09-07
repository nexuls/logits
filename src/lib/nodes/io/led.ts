import { defineNode } from "@/lib/nodes/define";

export const ledNode = defineNode({
  type: "io.led",
  title: "LED",
  symbol: "◉",
  category: "io",
  keywords: ["led", "lamp", "light", "output", "sink", "indicator"],
  defaultParams: { color: "green" },
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

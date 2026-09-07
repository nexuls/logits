import { defineNode, intParam } from "@/lib/nodes/define";

export const constantNode = defineNode({
  type: "io.constant",
  title: "Constant",
  symbol: "K",
  category: "io",
  keywords: ["constant", "literal", "vcc", "ground", "gnd", "tie", "source"],
  defaultParams: { width: 1, value: 1 },
  pins: (params) => [
    {
      id: "out",
      name: "OUT",
      direction: "out",
      width: intParam(params, "width", 1),
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 4, height: 4 }),
});

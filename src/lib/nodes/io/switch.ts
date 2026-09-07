import { defineNode, intParam } from "@/lib/nodes/define";

export const switchNode = defineNode({
  type: "io.switch",
  title: "Switch",
  icon: "toggle",
  category: "io",
  keywords: ["switch", "toggle", "input", "source", "dip"],
  defaultParams: { width: 1, value: 0 },
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

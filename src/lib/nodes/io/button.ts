import { defineNode } from "@/lib/nodes/define";

/** Momentary: high only while held, so it has no stored `value` param. */
export const buttonNode = defineNode({
  type: "io.button",
  title: "Button",
  symbol: "PB",
  category: "io",
  keywords: ["button", "momentary", "push", "input", "source"],
  defaultParams: {},
  pins: () => [
    {
      id: "out",
      name: "OUT",
      direction: "out",
      width: 1,
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 4, height: 4 }),
});

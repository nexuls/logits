import { boolParam, defineNode } from "@/lib/nodes/define";
import { createSignal, HIGH, LOW } from "@/lib/sim/logic";

/** Momentary: high only while held, so it has no stored `value` param. */
export const buttonNode = defineNode({
  type: "io.button",
  title: "Button",
  icon: "push-button",
  category: "io",
  keywords: ["button", "momentary", "push", "input", "source"],
  defaultParams: { pressed: false },
  view: "push-button",
  paramsSchema: [{ key: "pressed", label: "Pressed", kind: "bool" }],
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
  evaluate: (ctx) => {
    const pressed = boolParam(ctx.params, "pressed", false);
    ctx.write("out", createSignal(1, pressed ? HIGH : LOW));
  },
});

import { defineNode, intParam } from "@/lib/nodes/define";
import { toBits } from "@/lib/sim/logic";

export const constantNode = defineNode({
  type: "io.constant",
  title: "Constant",
  icon: "binary",
  category: "io",
  keywords: ["constant", "literal", "vcc", "ground", "gnd", "tie", "source"],
  defaultParams: { width: 1, value: 1 },
  view: "readout",
  paramsSchema: [
    { key: "width", label: "Bit width", kind: "int", min: 1, max: 64 },
    { key: "value", label: "Value", kind: "int", min: 0, hint: "Decimal." },
  ],
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
  evaluate: (ctx) => {
    ctx.write(
      "out",
      toBits(
        intParam(ctx.params, "value", 0),
        intParam(ctx.params, "width", 1),
      ),
    );
  },
});

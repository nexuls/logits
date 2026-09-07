import { defineNode, intParam } from "@/lib/nodes/define";
import { toBits } from "@/lib/sim/logic";

export const switchNode = defineNode({
  type: "io.switch",
  title: "Switch",
  icon: "toggle",
  category: "io",
  keywords: ["switch", "toggle", "input", "source", "dip"],
  defaultParams: { width: 1, value: 0 },
  view: "toggle",
  paramsSchema: [
    { key: "width", label: "Bit width", kind: "int", min: 1, max: 64 },
    {
      key: "value",
      label: "Value",
      kind: "int",
      min: 0,
      hint: "Decimal; the switch body toggles bit 0 on click.",
    },
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
  /**
   * The switch's position lives in `value`, a document param, so it survives a
   * reload and undoes with everything else. Toggling it is a command, and the
   * editor then asks the engine to re-evaluate this node — a param change is
   * not an event the engine can see for itself.
   */
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

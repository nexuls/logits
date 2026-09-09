import { defineNode, intParam } from "@/lib/nodes/define";
import { toBits } from "@/lib/sim/logic";

export const constantNode = defineNode({
  type: "io.constant",
  docs: `
A fixed value, tied onto a net and never changing.

## Behaviour

The digital equivalent of tying a pin to supply or to ground. **Value** is
entered in decimal and driven onto \`OUT\` least significant bit first, padded
or truncated to **Bit width**.

Nothing about it moves during a run: it emits its value once and holds it, so
it costs nothing per frame.

## Typical uses

- Logic 1 and logic 0 sources — width 1, value 1 or 0.
- A mask for an AND, or an increment operand for \`comb.adder\`.
- A hard-wired opcode on an ALU's \`OP\` while testing one operation.
- Tying an unused input to a defined level, so it reads \`0\` or \`1\` rather
  than floating at \`Z\` and poisoning everything downstream with \`X\`.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Constant",
  icon: "binary",
  category: "io",
  kind: "basic",
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

import { defineNode } from "@/lib/nodes/define";
import { createSignal, type LogicValue } from "@/lib/sim/logic";
import { widthOf, widthParam } from "../shared";
import { addSignals, carryInput, operand } from "./arith";

export const adderNode = defineNode({
  type: "comb.adder",
  docs: `
A ripple-carry adder: \`S = A + B + CIN\`, with the overflow out on \`COUT\`.

## Behaviour

**Bit width** sets the width of \`A\`, \`B\` and \`S\`. \`CIN\` and \`COUT\`
are always one bit.

Unknowns are handled per lane, in carry order: bits below an unresolved one
still add correctly, and everything from that bit up becomes \`X\` because the
carry into it is unknown. That is the honest answer, and it is more useful than
blanking the whole word — the low half of the result is still readable.

An unwired \`CIN\` floats and is taken as 0, so an adder works on its own.

## Two's complement

The same adder subtracts: invert \`B\` with a \`gate.not\` at the same width
and tie \`CIN\` high, and \`S\` is \`A − B\`. Put a \`gate.xor\` on \`B\`
instead, with the other XOR input also feeding \`CIN\`, and one control line
switches the part between adding and subtracting. \`comb.alu\` has both
already.

For signed arithmetic, read \`COUT\` as the *unsigned* carry — it is not the
signed overflow flag. Signed overflow is when the operands agree on sign and
the result does not, which \`comb.alu\` reports on its \`V\` pin.

## Typical uses

- A program counter's increment, with an \`io.constant\` of 1 on \`B\`.
- An accumulator loop with \`seq.register\`.
- Chaining two narrow adders: \`COUT\` of the low half into \`CIN\` of the
  high half.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Adder",
  shortTitle: "ADD",
  icon: "adder",
  category: "comb",
  keywords: ["adder", "add", "sum", "ripple", "carry", "arithmetic"],
  defaultParams: { width: 4 },
  paramsSchema: [widthParam()],
  pins: (params) => {
    const width = widthOf(params);
    return [
      { id: "a", name: "A", direction: "in", width, side: "left", offset: 2 },
      { id: "b", name: "B", direction: "in", width, side: "left", offset: 4 },
      {
        id: "cin",
        name: "CIN",
        direction: "in",
        width: 1,
        side: "left",
        offset: 6,
      },
      {
        id: "sum",
        name: "S",
        direction: "out",
        width,
        side: "right",
        offset: 3,
      },
      {
        id: "cout",
        name: "COUT",
        direction: "out",
        width: 1,
        side: "right",
        offset: 5,
      },
    ];
  },
  size: () => ({ width: 8, height: 8 }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const { sum, carryOut } = addSignals(
      operand(ctx.read("a"), width),
      operand(ctx.read("b"), width),
      carryInput(ctx.read("cin")[0] as LogicValue),
      width,
    );

    ctx.write("sum", sum);
    ctx.write("cout", createSignal(1, carryOut));
  },
});

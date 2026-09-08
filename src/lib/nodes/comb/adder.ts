import { defineNode } from "@/lib/nodes/define";
import { createSignal, type LogicValue } from "@/lib/sim/logic";
import { widthOf, widthParam } from "../shared";
import { addSignals, carryInput, operand } from "./arith";

export const adderNode = defineNode({
  type: "comb.adder",
  title: "Adder",
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

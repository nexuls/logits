import { defineNode, type ParamSpec } from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type LogicValue,
  X,
} from "@/lib/sim/logic";
import { boundedParam, stack, stackHeight } from "../shared";

const MIN_BITS = 1;
const MAX_BITS = 5;

const INPUT_BITS_PARAM: ParamSpec = {
  key: "inputBits",
  label: "Address bits",
  kind: "int",
  min: MIN_BITS,
  max: MAX_BITS,
  hint: "Outputs are 2 to this power, one-hot.",
};

/** One-hot decode of `in`, gated by `en`. `en` unwired reads Z and enables. */
export const decoderNode = defineNode({
  type: "comb.decoder",
  title: "Decoder",
  icon: "decoder",
  category: "comb",
  keywords: ["decoder", "one hot", "address", "select", "combinational"],
  defaultParams: { inputBits: 2 },
  paramsSchema: [INPUT_BITS_PARAM],
  pins: (params) => {
    const bits = boundedParam(params, "inputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const height = stackHeight(lines);

    return [
      {
        id: "in",
        name: "A",
        direction: "in",
        width: bits,
        side: "left",
        offset: height / 2,
      },
      {
        id: "en",
        name: "EN",
        direction: "in",
        width: 1,
        side: "top",
        offset: 3,
      },
      ...stack(
        Array.from({ length: lines }, (_, index) => ({
          id: `out${index}`,
          name: `Y${index}`,
          direction: "out" as const,
          width: 1,
        })),
        "right",
        height,
      ),
    ];
  },
  size: (params) => ({
    width: 6,
    height: stackHeight(
      2 ** boundedParam(params, "inputBits", 2, MIN_BITS, MAX_BITS),
    ),
  }),
  evaluate: (ctx) => {
    const bits = boundedParam(ctx.params, "inputBits", 2, MIN_BITS, MAX_BITS);
    const lines = 2 ** bits;
    const enable = ctx.read("en")[0] as LogicValue;
    const address = fromBits(ctx.read("in"));

    const level = (index: number): LogicValue => {
      if (enable === LOW) return LOW;
      if (enable === X) return X;
      if (address === null) return X;
      return index === address ? HIGH : LOW;
    };

    for (let index = 0; index < lines; index++) {
      ctx.write(`out${index}`, createSignal(1, level(index)));
    }
  },
});

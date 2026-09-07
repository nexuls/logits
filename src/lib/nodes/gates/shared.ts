import type { PinSpec } from "@/lib/circuit/schema";
import {
  intParam,
  type NodeDefinition,
  type NodeParams,
  type ParamSpec,
} from "@/lib/nodes/define";
import { AND2, type BitTable, combine } from "@/lib/sim/logic";

/**
 * The two gate shapes in the catalog: `in0`…`inN` → `out`, and `in` → `out`.
 * Every gate file passes its own type, title and keywords through one of
 * these, so the pin ids — which are save format — are written once, and so is
 * the bit-lane fold that makes a gate a gate.
 * See artifacts/06-node-catalog.md.
 */

const MIN_INPUTS = 2;
const MAX_INPUTS = 8;

/** Two grid cells between input stubs, so a wire can pass between them. */
const PIN_PITCH = 2;

export const GATE_WIDTH = 6;

/**
 * Both gate shapes are configured the same way, so the inspector schema is
 * written once here rather than per gate file — a new gate inherits it by
 * going through `symmetricGate` or `unaryGate`.
 */
const WIDTH_PARAM: ParamSpec = {
  key: "width",
  label: "Bit width",
  kind: "int",
  min: 1,
  max: 64,
  hint: "Lanes the gate operates on, bit for bit.",
};

const INPUTS_PARAM: ParamSpec = {
  key: "inputs",
  label: "Inputs",
  kind: "int",
  min: MIN_INPUTS,
  max: MAX_INPUTS,
};

type GateSpec = {
  type: string;
  title: string;
  icon: string;
  keywords: readonly string[];
  /**
   * Bit table folded pairwise across the inputs. Each table already bakes in
   * its controlling value, so an AND with one `0` input is `0` however many
   * unknowns join it — no special case here.
   */
  op: BitTable;
  /** NAND is AND inverted, NOR is OR inverted, NOT is a buffer inverted. */
  invert?: boolean;
};

function outputPin(width: number, height: number): PinSpec {
  return {
    id: "out",
    name: "Y",
    direction: "out",
    width,
    side: "right",
    offset: height / 2,
  };
}

function inputCount(params: NodeParams): number {
  const inputs = intParam(params, "inputs", MIN_INPUTS);
  return Math.min(MAX_INPUTS, Math.max(MIN_INPUTS, inputs));
}

function bodyHeight(inputs: number): number {
  return Math.max(4, inputs * PIN_PITCH);
}

/** `gate.and` and friends: n inputs, one output. */
export function symmetricGate({
  type,
  title,
  icon,
  keywords,
  op,
  invert,
}: GateSpec): NodeDefinition {
  return {
    type,
    title,
    category: "gates",
    keywords,
    icon,
    defaultParams: { inputs: MIN_INPUTS, width: 1 },
    paramsSchema: [INPUTS_PARAM, WIDTH_PARAM],
    pins: (params) => {
      const inputs = inputCount(params);
      const width = intParam(params, "width", 1);
      const height = bodyHeight(inputs);
      // Centred as a block so the stubs stay symmetric about the output as
      // `inputs` grows, rather than hanging off the top edge.
      const top = (height - (inputs - 1) * PIN_PITCH) / 2;

      return [
        ...Array.from({ length: inputs }, (_, index) => ({
          id: `in${index}`,
          name: `A${index}`,
          direction: "in" as const,
          width,
          side: "left" as const,
          offset: top + index * PIN_PITCH,
        })),
        outputPin(width, height),
      ];
    },
    size: (params) => ({
      width: GATE_WIDTH,
      height: bodyHeight(inputCount(params)),
    }),
    evaluate: (ctx) => {
      const width = intParam(ctx.params, "width", 1);
      const inputs = Array.from(
        { length: inputCount(ctx.params) },
        (_, index) => ctx.read(`in${index}`),
      );
      ctx.write("out", combine(inputs, width, op, invert));
    },
  };
}

/** `gate.not` and `gate.buffer`: one input, one output. */
export function unaryGate({
  type,
  title,
  icon,
  keywords,
  invert,
}: Omit<GateSpec, "op">): NodeDefinition {
  return {
    type,
    title,
    category: "gates",
    keywords,
    icon,
    defaultParams: { width: 1 },
    paramsSchema: [WIDTH_PARAM],
    pins: (params) => {
      const width = intParam(params, "width", 1);

      return [
        {
          id: "in",
          name: "A",
          direction: "in",
          width,
          side: "left",
          offset: 2,
        },
        outputPin(width, 4),
      ];
    },
    size: () => ({ width: GATE_WIDTH, height: 4 }),
    evaluate: (ctx) => {
      const width = intParam(ctx.params, "width", 1);
      // One input never reaches the fold, so the table is irrelevant — what a
      // unary gate does is normalise Z to X and optionally invert.
      ctx.write("out", combine([ctx.read("in")], width, AND2, invert));
    },
  };
}

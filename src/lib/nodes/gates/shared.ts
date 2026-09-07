import type { PinSpec } from "@/lib/circuit/schema";
import {
  intParam,
  type NodeDefinition,
  type NodeParams,
} from "@/lib/nodes/define";

/**
 * The two gate shapes in the catalog: `in0`…`inN` → `out`, and `in` → `out`.
 * Every gate file passes its own type, title and keywords through one of
 * these, so the pin ids — which are save format — are written once.
 * See artifacts/06-node-catalog.md.
 */

const MIN_INPUTS = 2;
const MAX_INPUTS = 8;

/** Two grid cells between input stubs, so a wire can pass between them. */
const PIN_PITCH = 2;

export const GATE_WIDTH = 6;

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
export function symmetricGate(
  type: string,
  title: string,
  symbol: string,
  keywords: readonly string[],
): NodeDefinition {
  return {
    type,
    title,
    category: "gates",
    keywords,
    symbol,
    defaultParams: { inputs: MIN_INPUTS, width: 1 },
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
  };
}

/** `gate.not` and `gate.buffer`: one input, one output. */
export function unaryGate(
  type: string,
  title: string,
  symbol: string,
  keywords: readonly string[],
): NodeDefinition {
  return {
    type,
    title,
    category: "gates",
    keywords,
    symbol,
    defaultParams: { width: 1 },
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
  };
}

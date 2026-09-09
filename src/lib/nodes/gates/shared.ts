import type { PinSpec } from "@/lib/circuit/schema";
import {
  defineNode,
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

/**
 * Appended to every gate's own help, so the paragraph about unknowns and about
 * widening a gate is written once rather than nine times. A gate file
 * documents what makes it that gate; this documents what makes it a gate.
 */
const SHARED_GATE_DOCS = `
## Unknown and floating inputs

Signals here are four-valued — \`0\`, \`1\`, \`X\` (contended or unknown) and
\`Z\` (nothing driving). A gate resolves what it honestly can: an input at a
*controlling* value settles the output whatever the others are, so an AND with
one real \`0\` is \`0\` even with an \`X\` beside it. Where the answer genuinely
depends on the unknown input, the output is \`X\`.

An unconnected input floats at \`Z\`, which is not a level. A gate treats it as
\`X\` rather than guessing a level, so a half-wired gate reads \`X\` instead of
quietly looking correct.

## On the canvas

1. Click the element in the palette, then click the canvas to drop it. Click
   the palette entry again first to arm several copies in one go.
2. Drag from an input pin to whatever drives it, and from \`Y\` to whatever it
   feeds. Click empty canvas mid-wire to drop a bend.
3. Select the gate to open the inspector, where **Bit width** lives — and
   **Inputs**, on the gates that have more than one. Changing either re-derives
   the pins: wires already attached stay put, but a width the other end does
   not share raises a width-mismatch warning on the wire.

Press \`R\` to rotate the selection, \`Ctrl/Cmd + D\` to duplicate it, and
\`Space\` to start or pause the simulation.
`;

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
  /** The abbreviation the canvas writes on the body, when `title` is long. */
  shortTitle?: string;
  /** Renderer name — `"block"` until this gate is drawn as a real symbol. */
  view?: string;
  icon: string;
  keywords: readonly string[];
  /** Markdown help, rendered by the palette's info dialog. */
  docs: string;
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
  shortTitle,
  icon,
  view,
  keywords,
  docs,
  op,
  invert,
}: GateSpec): NodeDefinition {
  return defineNode({
    type,
    title,
    shortTitle,
    view,
    category: "gates",
    // A row of interchangeable inputs on one side and the output on the other:
    // which pin is which is the shape, not the name.
    kind: "basic",
    keywords,
    icon,
    docs: docs + SHARED_GATE_DOCS,
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
  });
}

/** `gate.not` and `gate.buffer`: one input, one output. */
export function unaryGate({
  type,
  title,
  shortTitle,
  icon,
  view,
  keywords,
  docs,
  invert,
}: Omit<GateSpec, "op">): NodeDefinition {
  return defineNode({
    type,
    title,
    shortTitle,
    view,
    category: "gates",
    // A row of interchangeable inputs on one side and the output on the other:
    // which pin is which is the shape, not the name.
    kind: "basic",
    keywords,
    icon,
    docs: docs + SHARED_GATE_DOCS,
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
  });
}

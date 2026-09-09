import {
  defineNode,
  type NodeParams,
  type ParamSpec,
  stringParam,
} from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  LOW,
  type LogicValue,
  toBits,
  X,
  Z,
} from "@/lib/sim/logic";
import { boundedParam, widthOf, widthParam } from "../shared";
import { CONTENTS_PARAM, parseContents } from "./contents";

export const MIN_ADDRESS_BITS = 1;
export const MAX_ADDRESS_BITS = 12;

export const ADDRESS_BITS_PARAM: ParamSpec = {
  key: "addressBits",
  label: "Address bits",
  kind: "int",
  min: MIN_ADDRESS_BITS,
  max: MAX_ADDRESS_BITS,
  hint: "Cells are 2 to this power.",
};

export function addressBitsOf(params: NodeParams): number {
  return boundedParam(
    params,
    "addressBits",
    4,
    MIN_ADDRESS_BITS,
    MAX_ADDRESS_BITS,
  );
}

/**
 * Read-only memory. `data` is tri-state so several ROMs and a RAM may share
 * one bus — which is why the pin declares `tristate`, and why the netlist does
 * not call the shared bus a short.
 */
export const romNode = defineNode({
  type: "mem.rom",
  docs: `
Read-only memory: an address in, the stored word out. Contents are fixed and
part of the saved circuit.

## Behaviour

**Address bits** sets how many cells there are — 2 to that power — and **Bit
width** how wide each word is.

**Contents** is the memory image: hexadecimal words separated by spaces,
commas or newlines, lowest address first. Anything you do not list reads 0, and
a token that is not a number leaves a 0 rather than breaking the run — this is
hand-typed data with nowhere to report a parse error.

\`D\` is a **tri-state** output. \`EN\` held low releases the bus entirely and
\`D\` floats at \`Z\`, so several ROMs and a RAM can share one data bus
without the netlist calling it a short. Unwired, \`EN\` floats and the ROM
drives, which is the useful default for a ROM on its own.

An address that cannot be resolved gives \`X\` on \`D\` rather than reading
cell 0.

## Typical uses

- A lookup table — sine values, a character generator, a segment decoder.
- Microcode: the state number and opcode on \`A\`, the control lines on \`D\`.
- Instruction memory for a small CPU, with a \`seq.counter\` on the address.
- Replacing a heap of gates: any n-input, m-output function is a ROM with n
  address bits and m data bits.

## Editing contents

Select the ROM to open the inspector and type into **Contents**. It is a
document param, so it saves with the circuit, undoes with \`Ctrl/Cmd + Z\`,
and can be pasted in from elsewhere. Editing it re-creates the memory image on
the next reset.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "ROM",
  icon: "rom",
  view: "block",
  category: "mem",
  keywords: ["rom", "memory", "lookup", "table", "microcode"],
  defaultParams: { addressBits: 4, width: 8, contents: "" },
  paramsSchema: [ADDRESS_BITS_PARAM, widthParam(), CONTENTS_PARAM],
  pins: (params) => [
    {
      id: "addr",
      name: "A",
      direction: "in",
      width: addressBitsOf(params),
      side: "left",
      offset: 3,
    },
    { id: "en", name: "EN", direction: "in", width: 1, side: "top", offset: 4 },
    {
      id: "data",
      name: "D",
      direction: "out",
      width: widthOf(params),
      side: "right",
      offset: 3,
      tristate: true,
    },
  ],
  size: () => ({ width: 8, height: 6 }),
  createState: (params) => ({
    cells: parseContents(
      stringParam(params, "contents", ""),
      2 ** addressBitsOf(params),
      widthOf(params),
    ),
  }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const enable = ctx.read("en")[0] as LogicValue;

    // Held low the ROM lets go of the bus entirely; unwired it reads Z and
    // drives, which is the useful default for a ROM on its own.
    if (enable === LOW) {
      ctx.write("data", createSignal(width, Z));
      return;
    }

    const address = fromBits(ctx.read("addr"));
    if (enable === X || address === null) {
      ctx.write("data", createSignal(width, X));
      return;
    }

    const cells = (ctx.state as { cells?: number[] }).cells ?? [];
    ctx.write("data", toBits(cells[address] ?? 0, width));
  },
});

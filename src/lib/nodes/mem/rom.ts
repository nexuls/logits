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
  title: "ROM",
  icon: "rom",
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

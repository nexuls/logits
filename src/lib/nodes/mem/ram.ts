import { boolParam, defineNode, stringParam } from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type LogicValue,
  toBits,
  X,
  Z,
} from "@/lib/sim/logic";
import { detectEdge, NO_LEVEL } from "../edges";
import { spread, widthOf, widthParam } from "../shared";
import { CONTENTS_PARAM, parseContents } from "./contents";
import { ADDRESS_BITS_PARAM, addressBitsOf } from "./rom";

const BODY_WIDTH = 8;

type RamState = {
  /** null is a cell nobody has written a knowable value to. */
  cells: (number | null)[];
  clk: LogicValue | typeof NO_LEVEL;
};

/**
 * Read/write memory on a shared, bidirectional `data` bus.
 *
 * Contents are **runtime state**: they are re-created from the `contents`
 * param on every reset, exactly like a flip-flop's stored bit, and a write
 * during the run does not edit the document. That is deliberate — a memory
 * that rewrote the document as it ran would fill the undo history with one
 * entry per clock edge.
 */
export const ramNode = defineNode({
  type: "mem.ram",
  docs: `
Read/write memory on a shared, bidirectional data bus.

## Behaviour

**Address bits** sets the cell count — 2 to that power — and **Bit width** the
word size. **Contents** seeds the memory at reset, in the same hex format the
ROM uses.

\`D\` is a single \`inout\` pin: the same bus carries the word in on a write
and out on a read. That is what real static RAM does, and it means the
netlist expects other drivers on that net rather than flagging it.

| Pin | Effect |
| :-- | :-- |
| \`WE\` | Write enable. While high the part is *listening*, not driving |
| \`OE\` | Output enable. High drives the addressed word onto \`D\`; low or unwired releases it to \`Z\` |
| \`CLK\` | The write edge, when **Synchronous write** is on |
| \`A\` | Address |

**Synchronous write** on (the default) writes on the rising clock edge while
\`WE\` is high. Off, it writes for as long as \`WE\` is high with no clock at
all — simpler to wire, and a good way to see why real designs prefer the
clocked version.

The part never reads back its own bus during a write: while \`WE\` is high it
releases \`D\`. Letting it drive and listen at once is how a real one shorts
itself.

A write whose address or enable cannot be resolved could have landed anywhere,
so the **whole array** goes unknown rather than quietly staying intact.

## Contents are runtime state

A write during the run does **not** edit the document. The array is rebuilt
from the **Contents** param on every reset, exactly like a flip-flop's stored
bit. That is deliberate: a memory that rewrote the document as it ran would
put one undo entry on the stack per clock edge.

## Typical uses

- Data memory for a small CPU, sharing a bus with \`mem.rom\` through
  \`gate.tristate\` and a \`comb.decoder\` on the enables.
- A stack or a queue, with \`seq.counter\` driving the address.
- A frame or waveform buffer, written from one counter and read by another.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "RAM",
  icon: "ram",
  category: "mem",
  keywords: ["ram", "memory", "read", "write", "store", "sram"],
  defaultParams: {
    addressBits: 4,
    width: 8,
    synchronous: true,
    contents: "",
  },
  paramsSchema: [
    ADDRESS_BITS_PARAM,
    widthParam(),
    {
      key: "synchronous",
      label: "Synchronous write",
      kind: "bool",
      hint: "Off writes for as long as WE is high, with no clock.",
    },
    CONTENTS_PARAM,
  ],
  pins: (params) => {
    const offsets = spread(2, BODY_WIDTH);
    return [
      {
        id: "addr",
        name: "A",
        direction: "in",
        width: addressBitsOf(params),
        side: "left",
        offset: 3,
      },
      ...["we", "oe"].map((id, index) => ({
        id,
        name: id.toUpperCase(),
        direction: "in" as const,
        width: 1,
        side: "top" as const,
        offset: offsets[index],
      })),
      {
        id: "clk",
        name: "CLK",
        direction: "in",
        width: 1,
        side: "bottom",
        offset: BODY_WIDTH / 2,
      },
      {
        // Bidirectional: the same bus carries the word in and the word out,
        // which is what `inout` is for — and `inout` is tri-state by
        // definition, so the netlist expects other drivers on it.
        id: "data",
        name: "D",
        direction: "inout",
        width: widthOf(params),
        side: "right",
        offset: 3,
      },
    ];
  },
  size: () => ({ width: BODY_WIDTH, height: 6 }),
  createState: (params) => ({
    cells: parseContents(
      stringParam(params, "contents", ""),
      2 ** addressBitsOf(params),
      widthOf(params),
    ),
    clk: NO_LEVEL,
  }),
  evaluate: (ctx) => {
    const width = widthOf(ctx.params);
    const state = ctx.state as RamState;
    const synchronous = boolParam(ctx.params, "synchronous", true);

    const we = ctx.read("we")[0] as LogicValue;
    const oe = ctx.read("oe")[0] as LogicValue;
    const address = fromBits(ctx.read("addr"));

    const clk = ctx.read("clk")[0] as LogicValue;
    const edge = detectEdge(state.clk, clk, "rising");
    state.clk = clk;

    const writing = we === HIGH && (!synchronous || edge === "edge");
    if (writing && address !== null) {
      state.cells[address] = fromBits(ctx.read("data"));
    } else if (writing || (we !== LOW && we !== Z && edge !== "none")) {
      // A write whose address or enable nobody can resolve could have landed
      // anywhere, so the whole array is unknown rather than quietly intact.
      for (let index = 0; index < state.cells.length; index++) {
        state.cells[index] = null;
      }
    }

    // While WE is asserted the part is listening, not driving: letting it read
    // back its own bus during a write is how a real one shorts itself.
    if (we === HIGH || oe === LOW || oe === Z) {
      ctx.write("data", createSignal(width, Z));
      return;
    }

    const cell = address === null ? null : state.cells[address];
    ctx.write(
      "data",
      oe === X || cell === null || cell === undefined
        ? createSignal(width, X)
        : toBits(cell, width),
    );
  },
});

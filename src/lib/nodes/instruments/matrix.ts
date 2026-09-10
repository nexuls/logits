import { defineNode, type NodeParams } from "@/lib/nodes/define";
import { boundedParam, stack, stackHeight } from "../shared";

/**
 * An n × n grid of lamps, wired a row at a time.
 *
 * One pin per row, each the width of a row, rather than one very wide bus: a
 * 16 × 16 panel is 256 lamps and no single net in this app is that wide. It
 * also matches how a real panel is driven — a row at a time — without needing
 * the scan, which a display with no memory of its own could not hold.
 */

const MIN_SIZE = 2;
const MAX_SIZE = 16;

/** Fewest cells across the body, so a 2 × 2 panel is still a panel. */
const MIN_BODY = 8;

export function matrixSize(params: NodeParams): number {
  return boundedParam(params, "size", 8, MIN_SIZE, MAX_SIZE);
}

/** Pin id for row `index`, top row first. Part of the save format. */
export function rowPinId(index: number): string {
  return `row${index}`;
}

/** Square: rows need pin pitch, and the panel should not read as a column. */
function bodySize(params: NodeParams) {
  const height = stackHeight(matrixSize(params));
  return { width: Math.max(MIN_BODY, height), height };
}

export const matrixNode = defineNode({
  type: "disp.matrix",
  docs: `
A square panel of lamps, driven one row at a time — the display a dot-matrix
character or a game of life is drawn on.

## Behaviour

**Size** sets both dimensions: an 8 sets an 8 × 8 panel with eight row inputs,
each eight bits wide. Row 0 is the top row, and within a row the **most
significant bit is the leftmost lamp** — the order the value reads in when it
is written down, which is also the order \`bus.merge\` builds it in.

A lamp is lit for a \`1\` and dark for a \`0\`. A bit that is unknown or
floating is marked rather than merely left dark, so an unwired row is
distinguishable from a row of zeros — the panel is large enough that a
silently dark row is easy to mistake for a working one.

**Colour** is cosmetic and affects nothing electrically.

It has no memory of its own, which is the one thing to know before wiring one:
every row is displayed continuously from whatever drives it, so a scanned
design that lights one row at a time will show one row at a time here too. To
scan a panel, hold the frame in \`mem.ram\` or a bank of \`seq.register\` and
drive every row from that.

## Typical uses

- A dot-matrix glyph from \`mem.rom\`, one row per address, with a counter
  walking the addresses.
- Cellular automata and games of life, where each row is one register's output
  and the next state is combinational logic between them.
- A bank of status lamps too large to read as a \`disp.bargraph\` column.
- Watching a shift register move a pattern across a plane rather than a line.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Wire each \`R\` pin to a bus of the panel's width — \`bus.merge\` or a
   register's \`Q\` — or leave a row unwired and it shows as floating.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Matrix display",
  icon: "matrix",
  category: "instruments",
  kind: "basic",
  keywords: ["matrix", "grid", "panel", "dot matrix", "display", "leds"],
  defaultParams: { size: 8, color: "amber" },
  view: "matrix",
  paramsSchema: [
    {
      key: "size",
      label: "Size",
      kind: "int",
      min: MIN_SIZE,
      max: MAX_SIZE,
      hint: "Lamps across and down; one input per row.",
    },
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
      ],
    },
  ],
  pins: (params) => {
    const size = matrixSize(params);

    return stack(
      Array.from({ length: size }, (_, index) => ({
        id: rowPinId(index),
        name: `R${index}`,
        direction: "in" as const,
        width: size,
      })),
      "left",
      bodySize(params).height,
    );
  },
  size: bodySize,
});

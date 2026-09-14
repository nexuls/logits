import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { createSignal, fromBits, LOW, parseSignal, X } from "@/lib/sim/logic";
import { boundedParam, MAX_WIDTH, stack, stackHeight } from "../shared";

/**
 * A low-resolution pad the user draws on, read by the circuit as bits.
 *
 * The picture is a param — one `0`/`1` string per row — rather than state, for
 * the same reason a switch's position is: what was drawn is part of the circuit
 * the user saved, and it has to undo and reload with everything else, where
 * `state` is forgotten on every reset.
 *
 * Rows are stored leftmost pixel first, which is also MSB first, so a row reads
 * onto a bus the way `disp.matrix` draws one: the pad wired straight into a
 * panel shows the same picture.
 */

const MIN_RESOLUTION = 2;
/** A whole row goes out on one net, and no net in this app is wider. */
const MAX_RESOLUTION = MAX_WIDTH;
const DEFAULT_RESOLUTION = 8;

const DEFAULT_PIXEL_CELLS = 2;
const MIN_PIXEL_CELLS = 1;
const MAX_PIXEL_CELLS = 4;

/** Grid cells above the pixels for the size readout and the Clear button. */
const TOOLBAR_CELLS = 2;

export type DrawpadOutput = "rows" | "addressed";

export type PadCell = { row: number; column: number };

export function drawpadOutput(params: NodeParams): DrawpadOutput {
  return stringParam(params, "output", "rows") === "addressed"
    ? "addressed"
    : "rows";
}

export function drawpadResolution(params: NodeParams): {
  columns: number;
  rows: number;
} {
  return {
    columns: boundedParam(
      params,
      "columns",
      DEFAULT_RESOLUTION,
      MIN_RESOLUTION,
      MAX_RESOLUTION,
    ),
    rows: boundedParam(
      params,
      "rows",
      DEFAULT_RESOLUTION,
      MIN_RESOLUTION,
      MAX_RESOLUTION,
    ),
  };
}

/** Pin id for row `index`, top row first. Part of the save format. */
export function rowPinId(index: number): string {
  return `row${index}`;
}

/** Address bits that reach every one of `count` positions. */
export function addressBits(count: number): number {
  return Math.max(1, Math.ceil(Math.log2(count)));
}

/**
 * The stored picture, sanitised but *not* cropped to the resolution: shrinking
 * the pad and growing it back must not lose what was drawn at the edge. Only
 * what could never be shown at the largest resolution is dropped, so a
 * hand-edited file cannot grow the document without bound.
 */
export function storedPixels(params: NodeParams): string[] {
  const raw = params.pixels;
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, MAX_RESOLUTION)
    .map((entry) =>
      typeof entry === "string"
        ? entry.slice(0, MAX_RESOLUTION).replace(/[^1]/g, "0")
        : "",
    );
}

/** Exactly `rows` strings of exactly `columns` bits — what is on show. */
export function pixelRows(params: NodeParams): string[] {
  const { columns, rows } = drawpadResolution(params);
  const stored = storedPixels(params);

  return Array.from({ length: rows }, (_, row) =>
    (stored[row] ?? "").padEnd(columns, "0").slice(0, columns),
  );
}

/**
 * `pixels` with every cell in `cells` set to `lit`. Returns the very same
 * array when nothing changed, so a stroke that crosses only pixels it already
 * painted writes nothing.
 */
export function paintPixels(
  pixels: readonly string[],
  cells: readonly PadCell[],
  lit: boolean,
): readonly string[] {
  const bit = lit ? "1" : "0";
  let next: string[] | null = null;

  for (const { row, column } of cells) {
    if (row < 0 || column < 0) continue;
    if (row >= MAX_RESOLUTION || column >= MAX_RESOLUTION) continue;

    const current = (next ?? pixels)[row] ?? "";
    if ((current[column] ?? "0") === bit) continue;

    next ??= [...pixels];
    while (next.length <= row) next.push("");
    const padded = current.padEnd(column + 1, "0");
    next[row] = padded.slice(0, column) + bit + padded.slice(column + 1);
  }

  return next ?? pixels;
}

/**
 * Every cell on the straight line between two cells, both ends included.
 *
 * A pointer reports where it is once per event, not every cell it crossed, so
 * a quick stroke painted only at those points would come out as dots.
 */
export function cellsOnLine(from: PadCell, to: PadCell): PadCell[] {
  const cells: PadCell[] = [];
  const columnStep = from.column < to.column ? 1 : -1;
  const rowStep = from.row < to.row ? 1 : -1;
  const across = Math.abs(to.column - from.column);
  const down = -Math.abs(to.row - from.row);

  let { row, column } = from;
  let error = across + down;

  for (;;) {
    cells.push({ row, column });
    if (row === to.row && column === to.column) return cells;

    const twice = 2 * error;
    if (twice >= down) {
      error += down;
      column += columnStep;
    }
    if (twice <= across) {
      error += across;
      row += rowStep;
    }
  }
}

function bodySize(params: NodeParams) {
  const { columns, rows } = drawpadResolution(params);
  const pixel = boundedParam(
    params,
    "pixelSize",
    DEFAULT_PIXEL_CELLS,
    MIN_PIXEL_CELLS,
    MAX_PIXEL_CELLS,
  );
  const pinsPerSide = drawpadOutput(params) === "rows" ? rows : 2;

  // Pixels stay square: when the row pins need more height than the pixels
  // do, the view letterboxes the picture rather than stretching it.
  return {
    width: Math.max(6, columns * pixel),
    height: Math.max(stackHeight(pinsPerSide), rows * pixel + TOOLBAR_CELLS),
  };
}

export const drawpadNode = defineNode({
  type: "io.drawpad",
  docs: `
A small grid of pixels you draw on with the pointer, and the circuit reads as
bits — a hand-drawn glyph, sprite or bitmap without typing a ROM.

## Behaviour

**Columns** and **Rows** set the resolution, up to 32 × 32, and **Pixel size**
how many grid cells each pixel takes on the canvas. Changing the resolution
never erases anything: pixels outside it are kept, and come back when the pad
grows again.

A lit pixel is a \`1\`, a dark one a \`0\`. Within a row the **leftmost pixel is
the most significant bit**, the same order \`disp.matrix\` draws a row in, so a
pad wired row for row into a panel of the same size shows the same picture.

**Output** picks how the picture leaves the element:

- **One bus per row** — an \`R\` pin per row, each as wide as the pad. Every
  pixel is on a wire at once, which is what a display or a bank of registers
  wants.
- **Addressed** — \`X\` and \`Y\` select a pixel: \`PX\` is that pixel and
  \`ROW\` is the whole row \`Y\` names. This is how a pad larger than a
  handful of rows is scanned, the way a video circuit reads a framebuffer. An
  address past the edge reads \`0\`; an unknown or unwired address reads \`X\`,
  just as \`mem.rom\` does.

The picture is saved with the circuit and a reset does not clear it. **Colour**
is cosmetic.

## Typical uses

- Drawing a glyph and showing it on \`disp.matrix\`, or shifting it across one
  with a row of \`seq.register\`.
- The seed pattern for a game of life.
- A sprite for a scanned display: counters on \`X\` and \`Y\`, \`PX\` into the
  pixel logic.
- A hand-made lookup table: each row is a word, \`Y\` is the address.

## On the canvas

1. Place it from the palette and select it to set the resolution and output.
2. Press on a pixel and drag. The first pixel flips, and the rest of the stroke
   sets every pixel it crosses the same way — so a stroke that starts on a lit
   pixel erases. One stroke is one undo step.
3. From the keyboard, \`Tab\` to the pad: the arrow keys move a cursor,
   \`Shift\`+arrow draws as it moves, and \`Space\` or \`Enter\` flips the
   pixel under it.
4. **Clear** on the face empties the whole pad.`,
  title: "Draw pad",
  icon: "brush",
  category: "io",
  pinLabels: "floating",
  keywords: [
    "draw",
    "drawpad",
    "paint",
    "pixel",
    "bitmap",
    "sprite",
    "glyph",
    "canvas",
    "framebuffer",
    "input",
  ],
  defaultParams: {
    columns: DEFAULT_RESOLUTION,
    rows: DEFAULT_RESOLUTION,
    pixelSize: DEFAULT_PIXEL_CELLS,
    output: "rows",
    color: "green",
    pixels: [],
  },
  view: "pixel-pad",
  paramsSchema: [
    {
      key: "columns",
      label: "Columns",
      kind: "int",
      min: MIN_RESOLUTION,
      max: MAX_RESOLUTION,
      hint: "Pixels across; the width of each row.",
    },
    {
      key: "rows",
      label: "Rows",
      kind: "int",
      min: MIN_RESOLUTION,
      max: MAX_RESOLUTION,
      hint: "Pixels down.",
    },
    {
      key: "pixelSize",
      label: "Pixel size",
      kind: "int",
      min: MIN_PIXEL_CELLS,
      max: MAX_PIXEL_CELLS,
      hint: "Grid cells per pixel on the canvas.",
    },
    {
      key: "output",
      label: "Output",
      kind: "select",
      options: [
        { value: "rows", label: "One bus per row" },
        { value: "addressed", label: "Addressed (X / Y)" },
      ],
    },
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
      ],
    },
  ],
  pins: (params) => {
    const { columns, rows } = drawpadResolution(params);
    const { height } = bodySize(params);

    if (drawpadOutput(params) === "rows") {
      return stack(
        Array.from({ length: rows }, (_, index) => ({
          id: rowPinId(index),
          name: `R${index}`,
          direction: "out" as const,
          width: columns,
        })),
        "right",
        height,
      );
    }

    return [
      ...stack(
        [
          {
            id: "x",
            name: "X",
            direction: "in" as const,
            width: addressBits(columns),
          },
          {
            id: "y",
            name: "Y",
            direction: "in" as const,
            width: addressBits(rows),
          },
        ],
        "left",
        height,
      ),
      ...stack(
        [
          { id: "row", name: "ROW", direction: "out" as const, width: columns },
          { id: "px", name: "PX", direction: "out" as const, width: 1 },
        ],
        "right",
        height,
      ),
    ];
  },
  size: bodySize,
  evaluate: (ctx) => {
    const { columns, rows } = drawpadResolution(ctx.params);
    const picture = pixelRows(ctx.params);

    if (drawpadOutput(ctx.params) === "rows") {
      picture.forEach((bits, index) => {
        ctx.write(rowPinId(index), parseSignal(bits));
      });
      return;
    }

    const x = fromBits(ctx.read("x"));
    const y = fromBits(ctx.read("y"));

    if (y === null) {
      ctx.write("row", createSignal(columns, X));
      ctx.write("px", createSignal(1, X));
      return;
    }

    const bits = y < rows ? picture[y] : "0".repeat(columns);
    ctx.write("row", parseSignal(bits));
    ctx.write(
      "px",
      x === null
        ? createSignal(1, X)
        : x < columns
          ? parseSignal(bits[x])
          : createSignal(1, LOW),
    );
  },
});

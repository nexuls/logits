import { GRID_SIZE, type Size } from "@/lib/circuit/geometry";
import type { PinSpec } from "@/lib/circuit/schema";

/**
 * How much room text takes on a node body, in world units.
 *
 * Approximated from character counts rather than measured, and deliberately
 * so: the canvas re-derives a node's layout on every drag frame, and an
 * honest measurement means a browser layout pass per node per frame. The
 * approximation only ever *reserves* space — the real text is centred and
 * wrapped inside what it reserves — so an over-estimate costs a little
 * padding and an under-estimate costs a wrap, never a crash.
 *
 * It lives in the pure layer because both halves of the problem need the same
 * numbers: `defineNode` grows a body that cannot hold its own name, and
 * `block-view.tsx` lays the name out inside the body it ended up with. Two
 * copies of these constants would drift, and the symptom would be a title
 * clipped by a gutter that was sized for a different font.
 */

/** Distance from a pin to its label, clear of the 9px pin dot. */
export const PIN_LABEL_GAP = 7;

/** The label chip's own horizontal padding. */
export const PIN_LABEL_PAD = 2;

/** Advance of one pin-label character at the 7px font the canvas draws them in. */
export const PIN_LABEL_CHAR = 5.1;

/** `border-2` on the node body. */
export const BODY_BORDER_WIDTH = 2;

/** Breathing room on an edge that carries no pin label. */
export const BODY_INSET = 4;

/**
 * Font sizes the body title may use, largest first. A body that cannot hold
 * its name at 10px steps down rather than truncating straight away — three
 * steps, because past 7px the text stops being readable at 100% zoom and
 * ellipsis is the more honest answer.
 */
export const TITLE_FONT_STEPS = [10, 9, 8, 7] as const;

/** Mean glyph advance as a fraction of font size, for the UI sans stack. */
const TITLE_CHAR_RATIO = 0.58;

/** Line box as a fraction of font size — matches `leading-[1.15]`. */
export const TITLE_LINE_RATIO = 1.15;

/** Past three lines a title is no longer read, it is deciphered. */
export const TITLE_MAX_LINES = 3;

/**
 * The smallest type a body may *settle* at. A body whose name lands below this
 * is grown until it does not, which is what makes 7px the size a title reaches
 * only when a node's own view or a user's chip name overruns a fixed box —
 * never the size an element in the catalogue ships at.
 */
const TITLE_MIN_FONT = 8;

/**
 * Vertical has to be *clearly* roomier before the title turns on its side:
 * upright text is read faster, so a body that is a hair taller than it is wide
 * keeps its title horizontal.
 */
const VERTICAL_BIAS = 1.15;

/**
 * Characters a name draws, which is not its `length`: `Q̅` is a `Q` and a
 * combining macron — two code points wide and one glyph wide — and taking the
 * string at its word gives a flip-flop a gutter for a name twice the size of
 * the one on screen.
 */
export function labelChars(name: string): number {
  return [...name.replace(/\p{M}/gu, "")].length;
}

/** Width of `label` at `fontSize`, in world units. */
export function titleWidth(label: string, fontSize: number): number {
  return labelChars(label) * fontSize * TITLE_CHAR_RATIO;
}

export type Gutters = Record<PinSpec["side"], number>;

/**
 * Room the pin labels on each edge take away from the body's own content.
 *
 * Per side and sized to the names actually there, rather than one worst-case
 * gutter: a flip-flop whose vertical edges say `D` and `Q` keeps its title on
 * one line, where a gutter wide enough for `COUT` would have broken it in two.
 */
export function bodyGutters(
  pins: readonly { side: PinSpec["side"]; name: string }[],
  labelled: boolean,
): Gutters {
  const gutter = (side: PinSpec["side"]): number => {
    if (!labelled) return BODY_INSET;

    const widest = pins
      .filter((pin) => pin.side === side && pin.name)
      .reduce((max, pin) => Math.max(max, labelChars(pin.name)), 0);

    // Less the border: a pin sits on the body's outer edge, so its label is
    // placed from there, while this gutter is measured inside the border box.
    return widest === 0
      ? BODY_INSET
      : PIN_LABEL_GAP +
          PIN_LABEL_PAD +
          widest * PIN_LABEL_CHAR -
          BODY_BORDER_WIDTH;
  };

  return {
    left: gutter("left"),
    right: gutter("right"),
    top: gutter("top"),
    bottom: gutter("bottom"),
  };
}

/** The two clear runs left for the title once the pin gutters are taken out. */
export function titleSpace(
  bounds: { width: number; height: number },
  gutters: Gutters,
): { across: number; down: number } {
  return {
    across: bounds.width - gutters.left - gutters.right - 2 * BODY_BORDER_WIDTH,
    down: bounds.height - gutters.top - gutters.bottom - 2 * BODY_BORDER_WIDTH,
  };
}

/**
 * Which way the title runs, given the room on each axis.
 *
 * The one decision behind "one horizontal and one vertical variation": a title
 * is laid along whichever axis is genuinely longer, so a node turned on its
 * side — or one that is simply tall and narrow, like an 8-line encoder —
 * writes its name down the body instead of wrapping it into syllables.
 */
export function titleAxis(space: {
  across: number;
  down: number;
}): "horizontal" | "vertical" {
  return space.down > space.across * VERTICAL_BIAS ? "vertical" : "horizontal";
}

export type TitleLayout = {
  axis: "horizontal" | "vertical";
  fontSize: number;
  lineHeight: number;
  lines: number;
};

/**
 * The largest type size at which `label` still fits the room it has, and how
 * many lines it needs there.
 *
 * `along` is the run the text is set on and `stack` the perpendicular room the
 * wrapped lines pile into — which of the two is width and which is height is
 * what `axis` says. Falls through to the smallest step with as many lines as
 * fit, which is where the ellipsis finally appears.
 */
export function fitTitle(
  label: string,
  space: { across: number; down: number },
): TitleLayout {
  const axis = titleAxis(space);
  const along = axis === "vertical" ? space.down : space.across;
  const stack = axis === "vertical" ? space.across : space.down;

  for (const fontSize of TITLE_FONT_STEPS) {
    const lineHeight = fontSize * TITLE_LINE_RATIO;
    const lines = Math.max(1, Math.ceil(titleWidth(label, fontSize) / along));
    if (lines <= TITLE_MAX_LINES && lines * lineHeight <= stack) {
      return { axis, fontSize, lineHeight, lines };
    }
  }

  const fontSize = TITLE_FONT_STEPS[TITLE_FONT_STEPS.length - 1];
  const lineHeight = fontSize * TITLE_LINE_RATIO;
  return {
    axis,
    fontSize,
    lineHeight,
    lines: clamp(Math.floor(stack / lineHeight), 1, TITLE_MAX_LINES),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * A body grown until its name fits, with the pin band re-centred in it.
 *
 * The last resort behind the shorter names: `MUX` fits a six-cell box and
 * `Demultiplexer` never will, so a definition whose title cannot be set on one
 * line at the largest step — on *either* axis, since a tall body will write it
 * downwards — is widened until it can.
 *
 * Growth is added in whole pairs of cells and the pins on the horizontal edges
 * move by half of it, so a clock that was centred under the body stays centred
 * and every pin stays on the grid. Pins on the vertical edges keep their
 * offsets and ride the edge outwards on their own.
 */
export function fitBody(
  label: string,
  pins: readonly PinSpec[],
  size: Size,
  labelled: boolean,
): { size: Size; pins: readonly PinSpec[] } {
  const gutters = bodyGutters(pins, labelled);
  const bounds = {
    width: size.width * GRID_SIZE,
    height: size.height * GRID_SIZE,
  };

  const layout = fitTitle(label, titleSpace(bounds, gutters));
  const largest = TITLE_FONT_STEPS[0];
  if (layout.lines === 1 && layout.fontSize >= TITLE_MIN_FONT) {
    return { size, pins };
  }

  // Enough clear width for the name set across the body, and never less than
  // one line box — which is the room a *vertical* title needs across it, and
  // is what a tall body like an eight-line encoder ends up using instead.
  const lineBox = largest * TITLE_LINE_RATIO;
  const clear = Math.max(titleWidth(label, largest), lineBox);

  const growX = growth(
    bounds.width,
    clear + gutters.left + gutters.right + 2 * BODY_BORDER_WIDTH,
  );
  // Height matters even for a title set across the body: a flip-flop with
  // `RST`/`SET`/`EN` above and `CLK` below can be left with less clear height
  // than one line of text, and no amount of width fixes that.
  const growY = growth(
    bounds.height,
    lineBox + gutters.top + gutters.bottom + 2 * BODY_BORDER_WIDTH,
  );
  if (growX === 0 && growY === 0) return { size, pins };

  return {
    size: { width: size.width + growX, height: size.height + growY },
    // Half the growth on each side, so a pin band that was centred stays
    // centred and every offset stays on the grid: a pin's offset runs along
    // its own edge, so a horizontal edge answers to width and a vertical one
    // to height, while the pins on the far edges ride outwards by themselves.
    pins: pins.map((pin) => {
      const shift =
        pin.side === "top" || pin.side === "bottom" ? growX / 2 : growY / 2;
      return shift === 0 ? pin : { ...pin, offset: pin.offset + shift };
    }),
  };
}

/** Cells to add to reach `wanted`, in pairs so half of it stays on the grid. */
function growth(have: number, wanted: number): number {
  return Math.max(0, Math.ceil((wanted - have) / GRID_SIZE / 2) * 2);
}

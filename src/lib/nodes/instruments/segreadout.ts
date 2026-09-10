import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { boundedParam, spread, widthOf, widthParam } from "../shared";

/**
 * A multi-digit seven-segment readout with its decoder built in: a binary
 * value goes in one side and a number comes out the front.
 *
 * `comb.segdriver` wired to a row of `disp.sevenseg` is the same readout with
 * the decoding on show, and that is the pairing to reach for when the decode
 * *is* the exercise — seven Boolean functions of four inputs is the classic
 * one. This is the part for every circuit where the readout is not the point:
 * a counter, an ALU result, a register you want to be able to read while you
 * work on the thing that drives it, with no segment wiring in between.
 *
 * It has no `evaluate`. Like every other display it is a pure sink, and what
 * each digit shows is `readoutPatterns` — the driver's own decode, shared
 * rather than copied, so the two readouts cannot disagree about a `6` or
 * about whether `BL` beats `LT`.
 */

const MIN_DIGITS = 1;

/**
 * Eight, where `comb.segdriver` stops at four. The driver's limit is its pin
 * count — four digits is 28 output pins — and a readout that decodes for
 * itself has no segment pins to run out of, so it is bounded by what stays
 * legible on a body instead.
 */
const MAX_DIGITS = 8;

/** Body cells one digit takes, and the padding around the row of them. */
const DIGIT_CELLS = 6;
const BODY_PADDING = 6;
const BODY_HEIGHT = 12;

export function readoutDigitCount(params: NodeParams): number {
  return boundedParam(params, "digits", 4, MIN_DIGITS, MAX_DIGITS);
}

/** 16 for hexadecimal, 10 for decimal — the weight of each digit position. */
export function readoutBase(params: NodeParams): number {
  return stringParam(params, "radix", "dec") === "hex" ? 16 : 10;
}

function bodySize(params: NodeParams) {
  return {
    width: readoutDigitCount(params) * DIGIT_CELLS + BODY_PADDING,
    height: BODY_HEIGHT,
  };
}

export const segmentReadoutNode = defineNode({
  type: "disp.segreadout",
  docs: `
A seven-segment numeric readout: a binary value in, a number on the front. The
decoder is built in, so there is no segment wiring to do.

## Behaviour

The value on \`VAL\` is shown across **Digits** digits, least significant on
the right, split by **Radix** — decimal, so each digit shows \`0\`–\`9\`, or
hexadecimal, so each shows \`0\`–\`F\`. A value too large for the digits
fitted wraps rather than reporting an error, the way a real odometer does.

**Blank leading zeros** turns off the digits above the value, which is what
stops a 4-digit readout showing \`0007\`. The last digit is never blanked, so a
value of zero still reads \`0\`.

**Colour** is cosmetic and affects nothing electrically — the same LED colours
the lamp, the bargraph and the matrix panel offer, so a readout can be matched
to the rest of a panel.

\`DP\` is one bit per digit, bit 0 the least significant digit, so a fixed
decimal point is a constant and a moving one is a shift register. Leave it
unwired for no decimal point at all.

Two control inputs, both idle when unwired:

- \`BL\` blanks the whole readout — every segment off, whatever the value.
- \`LT\` is a lamp test: every digit shows all eight segments, so a dead one
  shows up.

\`BL\` wins over \`LT\`, the way a real part's blanking input does. A value
that cannot be resolved, or a control nobody can resolve, marks the digits as
unknown rather than guessing a glyph — a display that showed \`X\` as a dark
segment would quietly read as a different number.

## Typical uses

- A \`seq.counter\` shown in decimal, with no BCD conversion to build first.
- A register, an adder or an ALU result read in hex while you work on the
  logic driving it.
- A score, a clock or a tally in a larger circuit, where the readout is
  furniture rather than the subject.
- \`LT\` on a button, as the power-on lamp test a real instrument does.

Reach for \`comb.segdriver\` into \`disp.sevenseg\` instead when the decoding
is the exercise, or when you want the segment lines themselves visible.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Wire \`VAL\` to the value you want to read; **Bit width** should match what
   drives it, and the readout does the rest.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "7-segment readout",
  icon: "seven-segment",
  view: "seven-segment-readout",
  category: "instruments",
  pinLabels: "floating",
  keywords: [
    "seven segment",
    "7 segment",
    "readout",
    "display",
    "digits",
    "number",
    "decimal",
    "counter",
    "numeral",
  ],
  defaultParams: {
    width: 8,
    digits: 4,
    radix: "dec",
    blankLeading: true,
    color: "red",
  },
  paramsSchema: [
    widthParam("Bits of the value being displayed."),
    {
      key: "digits",
      label: "Digits",
      kind: "int",
      min: MIN_DIGITS,
      max: MAX_DIGITS,
      hint: "Least significant digit on the right.",
    },
    {
      key: "radix",
      label: "Radix",
      kind: "select",
      options: [
        { value: "dec", label: "Decimal" },
        { value: "hex", label: "Hexadecimal" },
      ],
    },
    { key: "blankLeading", label: "Blank leading zeros", kind: "bool" },
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
      ],
    },
  ],
  pins: (params) => {
    const { width, height } = bodySize(params);
    const [blank, lamp] = spread(2, width);

    return [
      {
        id: "value",
        name: "VAL",
        direction: "in",
        width: widthOf(params),
        side: "left",
        offset: height / 2,
      },
      {
        id: "bl",
        name: "BL",
        direction: "in",
        width: 1,
        side: "top",
        offset: blank,
      },
      {
        id: "lt",
        name: "LT",
        direction: "in",
        width: 1,
        side: "top",
        offset: lamp,
      },
      {
        // One bit per digit rather than one pin per digit: the points are a
        // word — a fixed one is a constant, a moving one is a shift register —
        // and eight extra bottom-edge pins would crowd out the digits.
        id: "dp",
        name: "DP",
        direction: "in",
        width: readoutDigitCount(params),
        side: "bottom",
        offset: width / 2,
      },
    ];
  },
  size: bodySize,
});

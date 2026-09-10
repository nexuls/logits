import {
  boolParam,
  defineNode,
  type NodeParams,
  stringParam,
} from "@/lib/nodes/define";
import {
  createSignal,
  fromBits,
  HIGH,
  LOW,
  type LogicValue,
  type Signal,
  X,
} from "@/lib/sim/logic";
import { SEGMENT_PATTERNS, SEGMENTS } from "../instruments/sevenseg";
import {
  boundedParam,
  controlState,
  spread,
  stack,
  stackHeight,
  widthOf,
  widthParam,
} from "../shared";

/**
 * The decoder half of a seven-segment readout: a binary value in, segment
 * lines out, one set per digit.
 *
 * `disp.sevenseg` in BCD mode decodes for itself, which is what you want when
 * the decoding is not the exercise. This is the part you reach for when it is
 * the exercise's *neighbour* — a counter whose value has to reach several
 * digits at once — because one driver feeds as many displays as it has digits
 * and each display stays in raw segment-pin mode.
 *
 * The decode table itself is `SEGMENT_PATTERNS`, shared with the display
 * rather than copied, so a driver and a self-decoding display cannot disagree
 * about what a `6` looks like.
 */

const MIN_DIGITS = 1;
const MAX_DIGITS = 4;
const BODY_WIDTH = 8;

/** A blanked digit: every segment dark, whatever the value underneath. */
const BLANK = "0000000";

/** All seven lit — the lamp test. */
const ALL = "1111111";

/** Pin id for one segment of one digit. Part of the save format. */
export function segmentPinId(digit: number, segment: string): string {
  return `d${digit}${segment}`;
}

export function digitCount(params: NodeParams): number {
  return boundedParam(params, "digits", 1, MIN_DIGITS, MAX_DIGITS);
}

/** 16 for hexadecimal, 10 for decimal — the weight of each digit position. */
export function digitBase(params: NodeParams): number {
  return stringParam(params, "radix", "hex") === "dec" ? 10 : 16;
}

/**
 * Segment patterns for each digit, least significant first. `null` is a digit
 * nobody can resolve; a blanked one is `BLANK`, which is dark rather than
 * unknown — the two are different answers and must not share a value.
 *
 * Exported so the decode can be tested as a table without a circuit.
 */
export function decodeDigits(
  value: number | null,
  digits: number,
  base: number,
  blankLeading: boolean,
): (string | null)[] {
  return Array.from({ length: digits }, (_, index) => {
    if (value === null) return null;

    const place = base ** index;
    // Leading-zero blanking is about the digits *above* the value, so it asks
    // what is left at this place rather than what this digit shows: a 0 with
    // nothing above it is a leading zero, the 0 in "10" is not.
    if (blankLeading && index > 0 && Math.floor(value / place) === 0) {
      return BLANK;
    }

    return SEGMENT_PATTERNS[Math.floor(value / place) % base];
  });
}

/**
 * What each digit shows, least significant first, once the two control inputs
 * have had their say: `null` is a digit nobody can resolve.
 *
 * The driver and the self-decoding readout both go through this, so "`BL`
 * wins over `LT`" and "an unresolvable control makes every digit unknown, not
 * just the ones the value could not settle" are decided once. Blanking is not
 * per-digit, which is why an unknown control cannot be folded in digit by
 * digit further down.
 */
export function readoutPatterns(
  value: Signal,
  digits: number,
  base: number,
  blankLeading: boolean,
  bl: LogicValue,
  lt: LogicValue,
): (string | null)[] {
  const blank = controlState(bl);
  const lamp = controlState(lt);
  const every = (pattern: string | null) =>
    Array.from({ length: digits }, () => pattern);

  if (blank === "unknown" || lamp === "unknown") return every(null);
  if (blank === "asserted") return every(BLANK);
  if (lamp === "asserted") return every(ALL);

  return decodeDigits(fromBits(value), digits, base, blankLeading);
}

export const segmentDriverNode = defineNode({
  type: "comb.segdriver",
  docs: `
Decodes a binary value into seven-segment lines, one set of segments per
digit, so a counter or a register can reach several \`disp.sevenseg\` displays
at once.

## Behaviour

The value is split into digits by **Radix** — hexadecimal, so each digit is
four bits and shows \`0\`–\`F\`, or decimal, so each digit is a power of ten
and shows \`0\`–\`9\`. **Digits** is how many displays it drives; each gets its
own \`A\`–\`G\` outputs, numbered by digit with digit 0 the least significant.
A value too large for the digits fitted wraps rather than reporting an error.

**Blank leading zeros** turns off digits above the value, which is what stops
a 4-digit readout showing \`0007\`. The least significant digit is never
blanked, so a value of zero still reads \`0\`.

**Common anode** inverts every output, so the segments a common-anode display
lights on \`0\` are driven low. Match it to the display's own setting or the
readout is inverted.

Two control inputs, both idle when unwired:

- \`BL\` blanks the whole readout — every segment off, whatever the value.
- \`LT\` is a lamp test: every segment on, so a dead segment shows up.

\`BL\` wins over \`LT\`, the way a real part's blanking input does. A value
that cannot be resolved, or a control nobody can resolve, drives \`X\` on
every segment rather than guessing a glyph.

## Typical uses

- A \`seq.counter\` into a multi-digit decimal readout — the driver in decimal
  mode is the whole of the BCD conversion.
- A register or an ALU result shown in hex, one digit per nibble.
- Driving one display in raw segment-pin mode, when the display's own BCD mode
  would hide the decoding you want visible.
- \`LT\` on a button, as the power-on lamp test a real instrument does.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Wire \`A\`–\`G\` of each digit to the matching pins of a \`disp.sevenseg\`
   in **Segment pins** mode; \`DP\` on the display stays yours to drive.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "7-segment driver",
  shortTitle: "7SEG",
  icon: "seven-segment",
  view: "block",
  category: "comb",
  keywords: [
    "seven segment",
    "7 segment",
    "driver",
    "decoder",
    "bcd",
    "7447",
    "digit",
  ],
  defaultParams: {
    width: 4,
    digits: 1,
    radix: "hex",
    blankLeading: true,
    commonAnode: false,
  },
  paramsSchema: [
    widthParam("Bits of the value being displayed."),
    {
      key: "digits",
      label: "Digits",
      kind: "int",
      min: MIN_DIGITS,
      max: MAX_DIGITS,
      hint: "One set of segment outputs each, digit 0 least significant.",
    },
    {
      key: "radix",
      label: "Radix",
      kind: "select",
      options: [
        { value: "hex", label: "Hexadecimal" },
        { value: "dec", label: "Decimal" },
      ],
    },
    { key: "blankLeading", label: "Blank leading zeros", kind: "bool" },
    {
      key: "commonAnode",
      label: "Common anode",
      kind: "bool",
      hint: "Drives segments low to light them.",
    },
  ],
  pins: (params) => {
    const digits = digitCount(params);
    const height = stackHeight(digits * SEGMENTS.length);
    const [blank, lamp] = spread(2, BODY_WIDTH);

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
      ...stack(
        Array.from({ length: digits }, (_, digit) =>
          SEGMENTS.map((segment) => ({
            id: segmentPinId(digit, segment),
            name: `${segment.toUpperCase()}${digit}`,
            direction: "out" as const,
            width: 1,
          })),
        ).flat(),
        "right",
        height,
      ),
    ];
  },
  size: (params) => ({
    width: BODY_WIDTH,
    height: stackHeight(digitCount(params) * SEGMENTS.length),
  }),
  evaluate: (ctx) => {
    const digits = digitCount(ctx.params);
    const commonAnode = boolParam(ctx.params, "commonAnode", false);
    const patterns = readoutPatterns(
      ctx.read("value"),
      digits,
      digitBase(ctx.params),
      boolParam(ctx.params, "blankLeading", true),
      ctx.read("bl")[0] as LogicValue,
      ctx.read("lt")[0] as LogicValue,
    );

    for (let digit = 0; digit < digits; digit++) {
      const pattern = patterns[digit];
      for (const [index, segment] of SEGMENTS.entries()) {
        const lit = pattern === null ? null : pattern[index] === "1";
        ctx.write(
          segmentPinId(digit, segment),
          createSignal(1, level(lit, commonAnode)),
        );
      }
    }
  },
});

/** `null` is "nobody can say"; otherwise the drive a common-anode part wants. */
function level(lit: boolean | null, commonAnode: boolean): LogicValue {
  if (lit === null) return X;
  return lit !== commonAnode ? HIGH : LOW;
}

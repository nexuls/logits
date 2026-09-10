"use client";

import { useMemo } from "react";
import { readoutPatterns } from "@/lib/nodes/comb/segdriver";
import { boolParam, colorParam } from "@/lib/nodes/define";
import {
  readoutBase,
  readoutDigitCount,
} from "@/lib/nodes/instruments/segreadout";
import { bodyGutters } from "@/lib/nodes/label-metrics";
import { createSignal, type LogicValue, parseSignal, Z } from "@/lib/sim/logic";
import { describeValue, type NodeViewProps } from "./node-views";
import SegmentDigit, {
  DIGIT_ADVANCE,
  DIGIT_HEIGHT,
  type SegmentState,
  statesFromPattern,
} from "./segment-digit";

/**
 * A row of seven-segment digits with the decoding built in.
 *
 * The glyph is `segment-digit.tsx`, shared with the single wired-up display;
 * what each digit *shows* is `readoutPatterns`, shared with the driver. This
 * file is only the arithmetic of laying the row out and the pins it reads —
 * neither the shape of a digit nor the meaning of `BL` is decided here.
 */

/** Space between two digits, in the same units as `DIGIT_ADVANCE`. */
const DIGIT_GAP = 12;

export default function SegmentReadoutView({
  node,
  def,
  resolved,
  readPin,
  showPinLabels,
}: NodeViewProps) {
  const digits = readoutDigitCount(node.params);
  const swatch = colorParam(def, node.params);

  const value = readPin("value");
  const dp = readPin("dp");

  // Least significant first, the way `readoutPatterns` numbers them; the row
  // is drawn in reverse so the least significant digit is on the right.
  const patterns = readoutPatterns(
    toSignal(value),
    digits,
    readoutBase(node.params),
    boolParam(node.params, "blankLeading", true),
    controlBit(readPin("bl")),
    controlBit(readPin("lt")),
  );

  const unknown = patterns.includes(null);

  // The pin names sit inside the body, so the digits are drawn in what is left
  // rather than under them — the same gutters `block-view.tsx` reserves for a
  // title, and they follow rotation because `pin.side` already has.
  const gutters = useMemo(
    () =>
      bodyGutters(
        resolved.pins.map((pin) => ({ side: pin.side, name: pin.spec.name })),
        showPinLabels,
      ),
    [resolved.pins, showPinLabels],
  );

  const pitch = DIGIT_ADVANCE + DIGIT_GAP;

  return (
    // Back out of the inset every view is placed in: the gutters are measured
    // from the body's own edge, as `bodyGutters` documents.
    <div
      className="pointer-events-none absolute -inset-1.5 flex items-center justify-center"
      style={{
        paddingLeft: gutters.left + 4,
        paddingRight: gutters.right + 4,
        paddingTop: gutters.top,
        paddingBottom: gutters.bottom,
      }}
      role="img"
      aria-label={`${node.label ?? "7-segment readout"}: ${describeValue(value)}`}
    >
      <svg
        viewBox={`0 0 ${digits * pitch - DIGIT_GAP} ${DIGIT_HEIGHT}`}
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <title>Seven-segment readout</title>
        {patterns.map((pattern, index) => (
          // Keyed and placed by column, counting from the left, since
          // `patterns` runs least significant first and the row does not:
          // digit 0 is always the rightmost.
          <SegmentDigit
            key={`column-${digits - 1 - index}`}
            segments={statesFromPattern(pattern)}
            dp={pointState(dp, index, pattern === null)}
            swatch={swatch}
            x={(digits - 1 - index) * pitch}
          />
        ))}
      </svg>
      {unknown && (
        // The states colour alone must not carry: an unresolved digit gets a
        // marker as well as the destructive fill.
        <span
          aria-hidden
          className="absolute top-0 right-0 text-[8px] font-bold text-destructive"
        >
          !
        </span>
      )}
    </div>
  );
}

/**
 * A pin's displayed string back into a signal. Nothing simulated yet reads as
 * an empty string, which is a zero-width signal — `fromBits` calls that 0, so
 * it is turned into a floating bit instead and the readout stays dark.
 */
function toSignal(value: string) {
  return value.length === 0 ? createSignal(1, Z) : parseSignal(value);
}

/** The one bit a control pin carries; unwired or unsimulated reads as `Z`. */
function controlBit(value: string): LogicValue {
  return value.length === 0 ? Z : (parseSignal(value)[0] as LogicValue);
}

/**
 * The decimal point for digit `index`, from the `DP` word's matching bit.
 *
 * A digit whose value nobody can resolve marks its point unknown too, so the
 * `!` and the destructive fill agree with each other across the whole digit.
 */
function pointState(
  dp: string,
  index: number,
  digitUnknown: boolean,
): SegmentState {
  if (digitUnknown) return "unknown";

  // `readPin` is MSB first and bit 0 is the least significant digit.
  const bit = dp[dp.length - 1 - index];
  if (bit === "1") return "on";
  if (bit === "X") return "unknown";
  return "off";
}

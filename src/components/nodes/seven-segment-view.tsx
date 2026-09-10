"use client";

import { useMemo } from "react";

import { boolParam, colorParam } from "@/lib/nodes/define";
import {
  isBcd,
  SEGMENT_PATTERNS,
  SEGMENTS,
} from "@/lib/nodes/instruments/sevenseg";
import { bodyGutters } from "@/lib/nodes/label-metrics";
import { fromBits, parseSignal } from "@/lib/sim/logic";
import { describeValue, type NodeViewProps } from "./node-views";
import SegmentDigit, {
  DIGIT_ADVANCE,
  DIGIT_HEIGHT,
  type SegmentState,
  segmentLevel,
  statesFromPattern,
} from "./segment-digit";

/**
 * A seven-segment digit, wired either a segment at a time or as a BCD value.
 *
 * The glyph itself is `segment-digit.tsx`, shared with the multi-digit
 * readout; what is left here is which pins feed it.
 *
 * A segment whose input is unknown is drawn in the destructive colour with the
 * digit marked, never merely "off": a display that showed `X` as a dark
 * segment would quietly read as a different number.
 */

export default function SevenSegmentView({
  node,
  def,
  resolved,
  readPin,
  showPinLabels,
}: NodeViewProps) {
  const commonAnode = boolParam(node.params, "commonAnode", false);
  // Through `colorParam` rather than a list of its own, so a red digit is the
  // same red as a red lamp and adding a colour stays a one-file change.
  const swatch = colorParam(def, node.params);
  const bcd = isBcd(node.params);

  const segments = bcd
    ? decode(readPin("value"))
    : Object.fromEntries(
        SEGMENTS.map((id) => [id, segmentLevel(readPin(id), commonAnode)]),
      );
  const dp = segmentLevel(readPin("dp"), commonAnode);

  const unknown =
    Object.values(segments).includes("unknown") || dp === "unknown";
  const digit = bcd
    ? readPin("value")
    : SEGMENTS.map((id) => readPin(id)).join("");

  // The pin names sit inside the body, so the digit is drawn in what is left
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

  return (
    // Back out of the inset every view is placed in: the gutters are measured
    // from the body's own edge, as `bodyGutters` documents.
    <div
      className="pointer-events-none absolute -inset-1.5 flex items-center justify-center"
      style={{
        paddingLeft: gutters.left + 5,
        paddingRight: gutters.right + 5,
        paddingTop: gutters.top,
        paddingBottom: gutters.bottom,
      }}
      role="img"
      aria-label={`${node.label ?? "7-segment"}: ${describeValue(digit)}`}
    >
      <svg
        viewBox={`0 0 ${DIGIT_ADVANCE} ${DIGIT_HEIGHT}`}
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <title>Seven-segment digit</title>
        <SegmentDigit segments={segments} dp={dp} swatch={swatch} />
      </svg>
      {unknown && (
        // The states colour alone must not carry: an unresolved segment gets a
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

/** BCD mode: the display does its own decoding from the 4-bit `value` pin. */
function decode(value: string): Record<string, SegmentState> {
  const digit = value.length > 0 ? fromBits(parseSignal(value)) : null;
  if (digit !== null) return statesFromPattern(SEGMENT_PATTERNS[digit % 16]);

  // Nothing simulated yet, or a floating input, reads as a dark display; only
  // a genuinely contended one is unknown.
  return statesFromPattern(value.includes("X") ? null : "0000000");
}

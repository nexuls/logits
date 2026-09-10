"use client";

import { useMemo } from "react";

import { boolParam } from "@/lib/nodes/define";
import {
  isBcd,
  SEGMENT_PATTERNS,
  SEGMENTS,
} from "@/lib/nodes/instruments/sevenseg";
import { bodyGutters } from "@/lib/nodes/label-metrics";
import { fromBits, parseSignal } from "@/lib/sim/logic";
import { describeValue, type NodeViewProps } from "./node-views";

/**
 * A seven-segment digit.
 *
 * SVG rather than seven divs so the segments keep their bevelled ends at every
 * zoom, and one path per segment so a lit segment is a fill change and nothing
 * re-lays out.
 *
 * A segment whose input is unknown is drawn in the destructive colour with the
 * digit marked, never merely "off": a display that showed `X` as a dark
 * segment would quietly read as a different number.
 */

/** The digit's own box, before the decimal point is allowed for. */
const DIGIT_WIDTH = 90;
const DIGIT_HEIGHT = 160;

/** Segment thickness, and the gap left between two that meet at a corner. */
const THICKNESS = 15;
const GAP = 4;

/** Where the decimal point sits, to the right of the digit's bottom corner. */
const DP_RADIUS = 8;
const DP_CX = DIGIT_WIDTH + GAP + DP_RADIUS;

/**
 * The two axes a segment can lie on. Both are the same six-sided bar — a
 * rectangle with its ends mitred to 45° — so the ends of a horizontal and a
 * vertical segment meet flush at a corner with only `GAP` between them.
 *
 * Written as a pair of tips and a half-thickness rather than as literal path
 * data: the corners have to line up exactly, and hand-written coordinates are
 * where the previous version's right-hand column drifted off the ends of the
 * bars above and below it.
 */
const H = THICKNESS / 2;

/** A horizontal bar with its tips at `x0` and `x1`, centred on `cy`. */
function horizontal(cy: number, x0: number, x1: number): string {
  return `M${x0} ${cy} L${x0 + H} ${cy - H} L${x1 - H} ${cy - H} L${x1} ${cy} L${x1 - H} ${cy + H} L${x0 + H} ${cy + H} Z`;
}

/** A vertical bar with its tips at `y0` and `y1`, centred on `cx`. */
function vertical(cx: number, y0: number, y1: number): string {
  return `M${cx} ${y0} L${cx + H} ${y0 + H} L${cx + H} ${y1 - H} L${cx} ${y1} L${cx - H} ${y1 - H} L${cx - H} ${y0 + H} Z`;
}

/**
 * Segment outlines in `SEGMENTS` order (a…g).
 *
 * The verticals are centred half a thickness in from each edge and the
 * horizontals run tip-to-tip between those centres, so every corner of the
 * digit is one mitre joint: `a`'s left tip is exactly `f`'s top tip, less the
 * gap that keeps the two readable as separate segments.
 */
const LEFT = H;
const RIGHT = DIGIT_WIDTH - H;
const TOP = H;
const MIDDLE = DIGIT_HEIGHT / 2;
const BOTTOM = DIGIT_HEIGHT - H;

const SEGMENT_PATHS: Record<(typeof SEGMENTS)[number], string> = {
  a: horizontal(TOP, LEFT + GAP, RIGHT - GAP),
  b: vertical(RIGHT, TOP + GAP, MIDDLE - GAP),
  c: vertical(RIGHT, MIDDLE + GAP, BOTTOM - GAP),
  d: horizontal(BOTTOM, LEFT + GAP, RIGHT - GAP),
  e: vertical(LEFT, MIDDLE + GAP, BOTTOM - GAP),
  f: vertical(LEFT, TOP + GAP, MIDDLE - GAP),
  g: horizontal(MIDDLE, LEFT + GAP, RIGHT - GAP),
};

type SegmentState = "on" | "off" | "unknown";

export default function SevenSegmentView({
  node,
  resolved,
  readPin,
  showPinLabels,
}: NodeViewProps) {
  const commonAnode = boolParam(node.params, "commonAnode", false);
  const bcd = isBcd(node.params);

  const segments = bcd
    ? decode(readPin("value"))
    : Object.fromEntries(
        SEGMENTS.map((id) => [id, level(readPin(id), commonAnode)]),
      );
  const dp = level(readPin("dp"), commonAnode);

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
        viewBox={`0 0 ${DP_CX + DP_RADIUS} ${DIGIT_HEIGHT}`}
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <title>Seven-segment digit</title>
        {/* Stroked in its own fill colour with round joins: it softens the
            mitres by a hair, which is what a moulded segment looks like, and
            costs nothing at zoom the way a path full of arcs would. */}
        <g strokeWidth={3} strokeLinejoin="round">
          {SEGMENTS.map((id) => (
            <path
              key={id}
              id={`seg-${id}`}
              d={SEGMENT_PATHS[id]}
              className={fillClass(segments[id] ?? "off")}
            />
          ))}
        </g>
        <circle
          cx={DP_CX}
          cy={BOTTOM}
          r={DP_RADIUS}
          className={fillClass(dp)}
        />
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

/** A raw segment pin, with the common-anode inversion applied. */
function level(value: string, commonAnode: boolean): SegmentState {
  if (value === "1") return commonAnode ? "off" : "on";
  if (value === "0") return commonAnode ? "on" : "off";
  // An unwired segment is floating rather than contended, and a dark segment
  // is the honest picture of one nothing drives.
  return value === "" || value === "Z" ? "off" : "unknown";
}

/** BCD mode: the display does its own decoding from the 4-bit `value` pin. */
function decode(value: string): Record<string, SegmentState> {
  const digit = value.length > 0 ? fromBits(parseSignal(value)) : null;
  const pattern = digit === null ? null : SEGMENT_PATTERNS[digit % 16];

  return Object.fromEntries(
    SEGMENTS.map((id, index) => [
      id,
      pattern === null
        ? value.includes("X")
          ? "unknown"
          : "off"
        : pattern[index] === "1"
          ? "on"
          : "off",
    ]),
  );
}

function fillClass(state: SegmentState): string {
  if (state === "unknown") return "fill-destructive stroke-destructive";
  return state === "on"
    ? "fill-[var(--logit-led-red)] stroke-[var(--logit-led-red)]"
    : "fill-muted-foreground/20 stroke-muted-foreground/20";
}

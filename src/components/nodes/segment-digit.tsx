"use client";

import type { CSSProperties } from "react";

import { SEGMENTS } from "@/lib/nodes/instruments/sevenseg";

/**
 * One seven-segment digit, as an SVG group.
 *
 * SVG rather than seven divs so the segments keep their bevelled ends at every
 * zoom, and one path per segment so a lit segment is a fill change and nothing
 * re-lays out.
 *
 * Its own file because two views draw the same digit: `seven-segment-view`
 * for a single wired-up display, and `segment-readout-view` for a row of them
 * on a self-decoding readout. Sharing the glyph is what stops the two drifting
 * into subtly different digits — the same reason the decode table itself is
 * shared rather than copied.
 */

/** The digit's own box, before the decimal point is allowed for. */
const DIGIT_WIDTH = 90;
export const DIGIT_HEIGHT = 160;

/** Segment thickness, and the gap left between two that meet at a corner. */
const THICKNESS = 15;
const GAP = 4;

/** Where the decimal point sits, to the right of the digit's bottom corner. */
const DP_RADIUS = 8;
const DP_CX = DIGIT_WIDTH + GAP + DP_RADIUS;

/** Everything one digit occupies, decimal point included. */
export const DIGIT_ADVANCE = DP_CX + DP_RADIUS;

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

export type SegmentState = "on" | "off" | "unknown";

/** A lit segment pattern — `SEGMENT_PATTERNS` order — as segment states. */
export function statesFromPattern(
  pattern: string | null,
): Record<string, SegmentState> {
  return Object.fromEntries(
    SEGMENTS.map((id, index) => [
      id,
      pattern === null ? "unknown" : pattern[index] === "1" ? "on" : "off",
    ]),
  );
}

/** A raw segment pin's string value, with the common-anode inversion applied. */
export function segmentLevel(
  value: string,
  commonAnode: boolean,
): SegmentState {
  if (value === "1") return commonAnode ? "off" : "on";
  if (value === "0") return commonAnode ? "on" : "off";
  // An unwired segment is floating rather than contended, and a dark segment
  // is the honest picture of one nothing drives.
  return value === "" || value === "Z" ? "off" : "unknown";
}

type Props = {
  /** Segment id (`a`…`g`) to its state; a missing one is drawn dark. */
  segments: Record<string, SegmentState>;
  dp: SegmentState;
  /** The lit colour, from the node's `color` param via `colorParam`. */
  swatch: string | undefined;
  /** Where this digit's box starts, in the parent's viewBox units. */
  x?: number;
};

export default function SegmentDigit({ segments, dp, swatch, x = 0 }: Props) {
  return (
    // Stroked in its own fill colour with round joins: it softens the mitres
    // by a hair, which is what a moulded segment looks like, and costs nothing
    // at zoom the way a path full of arcs would.
    <g
      transform={x === 0 ? undefined : `translate(${x} 0)`}
      strokeWidth={3}
      strokeLinejoin="round"
    >
      {SEGMENTS.map((id) => (
        <path
          key={id}
          d={SEGMENT_PATHS[id]}
          className={fillClass(segments[id] ?? "off")}
          style={segmentStyle(segments[id] ?? "off", swatch)}
        />
      ))}
      <circle
        cx={DP_CX}
        cy={BOTTOM}
        r={DP_RADIUS}
        className={fillClass(dp)}
        style={segmentStyle(dp, swatch)}
      />
    </g>
  );
}

function fillClass(state: SegmentState): string {
  if (state === "unknown") return "fill-destructive stroke-destructive";
  return state === "on"
    ? "fill-current stroke-current"
    : "fill-muted-foreground/20 stroke-muted-foreground/20";
}

/**
 * A lit segment's hue, which is a parameter and so cannot be a class.
 *
 * `color` rather than `fill` so the one property drives both the fill and the
 * stroke that rounds the corners, and the two can never be set to different
 * colours. Only the lit state takes it: an unknown segment stays destructive
 * and an unlit one stays muted, whatever colour the display is.
 */
function segmentStyle(
  state: SegmentState,
  swatch: string | undefined,
): CSSProperties | undefined {
  return state === "on" && swatch ? { color: swatch } : undefined;
}

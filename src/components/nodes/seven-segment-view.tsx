"use client";

import { boolParam } from "@/lib/nodes/define";
import {
  isBcd,
  SEGMENT_PATTERNS,
  SEGMENTS,
} from "@/lib/nodes/instruments/sevenseg";
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

/** Segment outlines on a 100 x 160 digit, in `SEGMENTS` order (a…g). */
const SEGMENT_PATHS: Record<(typeof SEGMENTS)[number], string> = {
  a: "M22 8 L78 8 L86 16 L78 24 L22 24 L14 16 Z",
  b: "M82 20 L90 28 L90 68 L82 76 L74 68 L74 28 Z",
  c: "M82 84 L90 92 L90 132 L82 140 L74 132 L74 92 Z",
  d: "M22 136 L78 136 L86 144 L78 152 L22 152 L14 144 Z",
  e: "M18 84 L26 92 L26 132 L18 140 L10 132 L10 92 Z",
  f: "M18 20 L26 28 L26 68 L18 76 L10 68 L10 28 Z",
  g: "M22 72 L78 72 L86 80 L78 88 L22 88 L14 80 Z",
};

type SegmentState = "on" | "off" | "unknown";

export default function SevenSegmentView({ node, readPin }: NodeViewProps) {
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

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      role="img"
      aria-label={`${node.label ?? "7-segment"}: ${describeValue(digit)}`}
    >
      <svg
        viewBox="0 0 110 160"
        className="h-full"
        aria-hidden="true"
        focusable="false"
      >
        <title>Seven-segment digit</title>
        {SEGMENTS.map((id) => (
          <path
            key={id}
            d={SEGMENT_PATHS[id]}
            className={fillClass(segments[id] ?? "off")}
          />
        ))}
        <circle cx={100} cy={146} r={7} className={fillClass(dp)} />
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
  if (state === "unknown") return "fill-destructive";
  return state === "on"
    ? "fill-[var(--logit-led-red)]"
    : "fill-muted-foreground/20";
}

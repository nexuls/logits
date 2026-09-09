"use client";

import { useMemo } from "react";

import { bodyGutters, fitTitle, titleSpace } from "@/lib/nodes/label-metrics";
import type { NodeViewProps } from "./node-views";

/**
 * The default body: a rectangle with the element's name in it.
 *
 * Every element is drawn by this until someone draws it a real symbol, which
 * is why it is a view like any other rather than something the canvas does for
 * nodes that have none — swapping in a gate outline later is then one
 * component and one `view:` line, with no change here and none in
 * `circuit-node.tsx`.
 *
 * Its whole job is to put the name somewhere legible whichever way the element
 * has been turned. It measures the clear run on each axis — the body less the
 * gutters its own pin labels occupy, which rotation has already moved to the
 * edges they ended up on — and sets the name along the longer one. A tall
 * body, whether authored tall or turned on its side, writes its name downwards
 * rather than hyphenating it into syllables.
 */
export default function BlockView({
  def,
  resolved,
  showPinLabels,
}: NodeViewProps) {
  const { bounds, pins } = resolved;

  // What the element is called *on a schematic*: `MUX`, not `Multiplexer`.
  // The palette, the inspector and the docs dialog keep the long name.
  const label = def.shortTitle ?? def.title;

  const { gutters, layout } = useMemo(() => {
    const gutters = bodyGutters(
      pins.map((pin) => ({ side: pin.side, name: pin.spec.name })),
      showPinLabels,
    );
    return { gutters, layout: fitTitle(label, titleSpace(bounds, gutters)) };
  }, [label, bounds, pins, showPinLabels]);

  const vertical = layout.axis === "vertical";

  return (
    // Back out of the inset every view is placed in: the gutters are measured
    // from the body's own edge, so this has to be the body. `pointer-events`
    // stay off because there is nothing here to click — picking is hit-tested
    // against the scene, and a block that swallowed the pointer would stop a
    // drag from starting on it.
    <div className="pointer-events-none absolute -inset-[6px] flex items-center justify-center overflow-hidden rounded-[4px]">
      <span
        className="text-center font-medium break-words"
        style={{
          // Reserving the gutters rather than letting the two overlap: the
          // name is centred and the pin labels are pinned to the edges, so on
          // a narrow body they collide, and a name wrapped to fit is legible
          // where one crossed out by an `A1` is not. Physical sides, not
          // logical ones, so they mean the same thing in both writing modes.
          maxWidth: bounds.width,
          maxHeight: bounds.height,
          paddingLeft: gutters.left,
          paddingRight: gutters.right,
          paddingTop: gutters.top,
          paddingBottom: gutters.bottom,
          fontSize: layout.fontSize,
          lineHeight: `${layout.lineHeight}px`,
          // `-webkit-box` is still the only line clamp that works in both
          // writing modes; its orientation is the *block* direction, so it
          // stays "vertical" whichever way the text itself runs.
          display: "-webkit-box",
          WebkitBoxOrient: "vertical",
          WebkitLineClamp: layout.lines,
          overflow: "hidden",
          // Bottom-to-top, as a schematic sets a name down a tall part:
          // `vertical-rl` alone runs it top-to-bottom, and the half turn puts
          // the first letter at the bottom without tipping the glyphs off
          // their own baseline.
          writingMode: vertical ? "vertical-rl" : undefined,
          rotate: vertical ? "180deg" : undefined,
        }}
      >
        {label}
      </span>
    </div>
  );
}

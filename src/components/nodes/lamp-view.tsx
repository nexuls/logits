"use client";

import { colorParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import { describeValue, type NodeViewProps, valueGlyph } from "./node-views";

/**
 * A lamp: lit on `1`, dark on `0`, marked on `X` or a floating net.
 *
 * The colour param is a *hue*, and the lit/unlit distinction is carried by
 * brightness and a glyph as well, so the state is legible without colour
 * vision and without a legend (see the accessibility rules in AGENTS.md).
 *
 * The hue itself comes from the definition's own `color` param, through
 * `colorParam`, which is the same list the inspector draws its swatches from —
 * there is no palette in this file to fall out of step with it.
 */

export default function LampView({ node, def, readPin }: NodeViewProps) {
  const value = readPin("in");
  const swatch = colorParam(def, node.params);

  const lit = value === "1";
  const unknown = value.includes("X");
  const glyph = valueGlyph(value);

  return (
    <div
      className="flex h-full w-full items-center justify-center"
      role="img"
      aria-label={`${node.label ?? "LED"}: ${describeValue(value)}`}
    >
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full border text-[9px] font-bold leading-none transition-colors",
          unknown
            ? "border-destructive bg-destructive/20 text-destructive"
            : lit
              ? "border-transparent"
              : "border-border bg-muted text-muted-foreground",
        )}
        style={
          lit && !unknown
            ? {
                background: swatch,
                // The glow is the hue at 60% against the canvas, matching the
                // swatch rather than a second colour that has to be kept in
                // step with it.
                boxShadow: `0 0 8px 2px color-mix(in oklab, ${swatch} 60%, transparent)`,
              }
            : undefined
        }
      >
        {lit ? null : glyph}
      </span>
    </div>
  );
}

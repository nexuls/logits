"use client";

import { cn } from "@/lib/utils";
import { describeValue, type NodeViewProps, valueGlyph } from "./node-views";

/**
 * A lamp: lit on `1`, dark on `0`, marked on `X` or a floating net.
 *
 * The colour param is a *hue*, and the lit/unlit distinction is carried by
 * brightness and a glyph as well, so the state is legible without colour
 * vision and without a legend (see the accessibility rules in AGENTS.md).
 */

const COLORS: Record<string, { lit: string; ring: string }> = {
  green: { lit: "bg-emerald-400", ring: "shadow-emerald-400/60" },
  red: { lit: "bg-red-400", ring: "shadow-red-400/60" },
  amber: { lit: "bg-amber-400", ring: "shadow-amber-400/60" },
  blue: { lit: "bg-sky-400", ring: "shadow-sky-400/60" },
};

export default function LampView({ node, readPin }: NodeViewProps) {
  const value = readPin("in");
  const color =
    COLORS[typeof node.params.color === "string" ? node.params.color : ""] ??
    COLORS.green;

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
              ? cn(
                  "border-transparent shadow-[0_0_8px_2px]",
                  color.lit,
                  color.ring,
                )
              : "border-border bg-muted text-muted-foreground",
        )}
      >
        {lit ? null : glyph}
      </span>
    </div>
  );
}

"use client";

import { colorParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import { describeValue, type NodeViewProps } from "./node-views";

/**
 * One lamp per bit, most significant at the top — the order the value reads in
 * when written down, which is also the order `readPin` returns.
 *
 * It shares the LED's colour list through `colorParam` rather than declaring
 * one, so a bargraph and a LED set to "amber" are the same amber.
 */
export default function BargraphView({ node, def, readPin }: NodeViewProps) {
  const value = readPin("in");
  const swatch = colorParam(def, node.params);
  const bits = value.length > 0 ? value.split("") : [];

  return (
    <div
      className="flex h-full w-full flex-col justify-center gap-[2px]"
      role="img"
      aria-label={`${node.label ?? def.title}: ${describeValue(value)}`}
    >
      {bits.map((bit, index) => (
        <span
          // Bit position, not the value — two bits reading "1" are still
          // different lamps and must not swap places when one changes.
          key={`bit-${bits.length - index}`}
          className={cn(
            "flex h-full min-h-[2px] flex-1 items-center justify-center rounded-[1px] border text-[7px] font-bold leading-none",
            bit === "X"
              ? "border-destructive bg-destructive/25 text-destructive"
              : bit === "1"
                ? "border-transparent"
                : "border-border/60 bg-muted text-muted-foreground",
          )}
          style={
            bit === "1"
              ? {
                  background: swatch,
                  boxShadow: `0 0 4px 1px color-mix(in oklab, ${swatch} 55%, transparent)`,
                }
              : undefined
          }
        >
          {bit === "X" ? "!" : bit === "Z" ? "~" : null}
        </span>
      ))}
    </div>
  );
}

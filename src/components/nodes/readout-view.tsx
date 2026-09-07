"use client";

import { fromBits, parseSignal } from "@/lib/sim/logic";
import { cn } from "@/lib/utils";
import { describeValue, type NodeViewProps, valueClass } from "./node-views";

/**
 * A numeric readout of whatever is on the node's single pin.
 *
 * Shared by the probe and the constant, which is the point of keying views by
 * behaviour rather than by node type: both display one net's value, and the
 * `radix` param — absent on the constant — picks the base.
 *
 * `X` and `Z` have no numeric value, so those are shown as the bit pattern
 * rather than converted; a readout claiming `0` for a floating bus would be a
 * lie the user cannot see through.
 */
export default function ReadoutView({ node, def, readPin }: NodeViewProps) {
  const pinId = def.pins(node.params)[0]?.id ?? "";
  const value = readPin(pinId);
  const radix =
    typeof node.params.radix === "string" ? node.params.radix : "binary";

  return (
    <div
      className="flex h-full w-full items-center justify-center px-1"
      role="img"
      aria-label={`${node.label ?? def.title}: ${describeValue(value)}`}
    >
      <span
        className={cn(
          "truncate font-mono text-[11px] leading-none tabular-nums",
          valueClass(value),
        )}
      >
        {format(value, radix)}
      </span>
    </div>
  );
}

function format(value: string, radix: string): string {
  if (value.length === 0) return "--";

  const numeric = fromBits(parseSignal(value));
  if (numeric === null || radix === "binary") return value;

  return radix === "hex"
    ? `0x${numeric.toString(16).toUpperCase()}`
    : String(numeric);
}

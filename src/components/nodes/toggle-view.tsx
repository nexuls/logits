"use client";

import { intParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

/**
 * A latching switch: click toggles bit 0 and it stays there.
 *
 * The position lives in the `value` param, not in view state, so it survives a
 * reload, undoes with everything else, and reaches the engine through the
 * ordinary param path. Wider than one bit, this toggles the low bit only — the
 * inspector is where a multi-bit value is typed.
 */
export default function ToggleView({
  node,
  readPin,
  setParams,
  interactive,
}: NodeViewProps) {
  const width = intParam(node.params, "width", 1);
  const value = intParam(node.params, "value", 0);
  const on = value % 2 === 1;
  const driven = readPin("out");

  return (
    <button
      type="button"
      disabled={!interactive}
      // The node body is draggable, so an interactive part has to take the
      // pointer back — otherwise the click starts a move gesture instead.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={() => setParams({ value: on ? value - 1 : value + 1 })}
      aria-pressed={on}
      aria-label={`${node.label ?? "Switch"}: ${on ? "on" : "off"}`}
      title={width > 1 ? `Value ${value} (${driven})` : undefined}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-[3px] transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        interactive ? "cursor-pointer" : "cursor-default",
      )}
    >
      <span
        className={cn(
          "flex h-3.5 w-6 items-center rounded-full border px-0.5 transition-colors",
          on ? "border-primary bg-primary/25" : "border-border bg-muted",
        )}
      >
        <span
          className={cn(
            "size-2.5 rounded-full transition-transform",
            on
              ? "translate-x-2.5 bg-primary"
              : "translate-x-0 bg-muted-foreground",
          )}
        />
      </span>
    </button>
  );
}

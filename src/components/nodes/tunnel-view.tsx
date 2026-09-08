"use client";

import { stringParam } from "@/lib/nodes/define";
import { cn } from "@/lib/utils";
import { describeValue, type NodeViewProps, valueClass } from "./node-views";

/**
 * A tunnel shows the net it names, because the name *is* the wire: two
 * tunnels a metre apart on the sheet are the same net, and the only thing
 * telling the reader that is the label.
 *
 * An unnamed tunnel says so rather than showing an empty box — it joins
 * nothing until it is named, and silently doing nothing is the confusing case.
 */
export default function TunnelView({ node, readPin }: NodeViewProps) {
  const name = stringParam(node.params, "name", "").trim();
  const value = readPin("io");

  return (
    <div
      className="flex h-full w-full items-center justify-center px-1"
      role="img"
      aria-label={
        name.length > 0
          ? `Tunnel ${name}: ${describeValue(value)}`
          : "Unnamed tunnel, joined to nothing"
      }
    >
      <span
        className={cn(
          "truncate font-mono text-[10px] leading-none",
          name.length > 0 ? valueClass(value) : "text-muted-foreground italic",
        )}
      >
        {name.length > 0 ? name : "unnamed"}
      </span>
    </div>
  );
}

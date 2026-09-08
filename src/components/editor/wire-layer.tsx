"use client";

import { memo } from "react";

import { valueGlyph } from "@/components/nodes/node-views";
import type { Rect } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import { smoothPath } from "@/lib/circuit/wire-path";
import { cn } from "@/lib/utils";
import type { ResolvedWire, Scene } from "@/state/scene";
import { useNetValue } from "@/state/simulation";

type Props = {
  scene: Scene;
  selectedWireIds: readonly string[];
  faultedWireIds: ReadonlySet<string>;
  /** The wire being drawn, if any, already routed to the cursor. */
  pending: { points: Point[]; unresolved: boolean } | null;
  /** Rubber-band box in world coordinates, while one is being dragged. */
  band: Rect | null;
};

/**
 * Every wire, in one SVG inside the transformed layer.
 *
 * One SVG for all of them, not one per wire (artifacts/02-architecture.md).
 * The element is a zero-size box with `overflow: visible`, so its children draw
 * at world coordinates without a viewBox that would have to track the pan.
 *
 * It takes no pointer events at all: wire picking is done against
 * `ResolvedWire.points` in `use-editor-gestures.ts`, which keeps the clickable
 * thickness constant in screen pixels at every zoom. `vector-effect` does the
 * same job for the stroke itself, so a wire stays legible zoomed out and does
 * not turn into a slab zoomed in.
 */
function WireLayer({
  scene,
  selectedWireIds,
  faultedWireIds,
  pending,
  band,
}: Props) {
  const selected = new Set(selectedWireIds);

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0 overflow-visible"
      width="1"
      height="1"
      aria-hidden
    >
      <title>Wires</title>

      {Object.entries(scene.wires).map(([id, wire]) => (
        <Wire
          key={id}
          wire={wire}
          selected={selected.has(id)}
          faulted={faultedWireIds.has(id)}
        />
      ))}

      {pending && (
        <path
          d={smoothPath(pending.points)}
          fill="none"
          strokeWidth={3}
          strokeDasharray="6 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          className={cn(
            pending.unresolved ? "stroke-destructive" : "stroke-primary",
          )}
        />
      )}

      {band && (
        <rect
          x={band.x}
          y={band.y}
          width={band.width}
          height={band.height}
          vectorEffect="non-scaling-stroke"
          className="fill-primary/10 stroke-primary"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
      )}
    </svg>
  );
}

export default memo(WireLayer);

type WireProps = {
  wire: ResolvedWire;
  selected: boolean;
  faulted: boolean;
};

/**
 * One wire, subscribed to its own net.
 *
 * The subscription is per net rather than per simulation, so a bus toggling at
 * 1 MHz re-renders this `<g>` and nothing else — the whole point of the
 * `useSyncExternalStore` boundary.
 */
function Wire({ wire, selected, faulted }: WireProps) {
  // Both ends are on the same net by construction; either is the wire's value.
  const value = useNetValue(wire.from?.netId ?? wire.to?.netId ?? null);

  if (wire.points.length < 2) {
    // A wire whose pin no longer exists. There is nothing to route between, so
    // it is reported by the netlist rather than drawn as a guess.
    return null;
  }

  const bits = Math.max(wire.from?.spec.width ?? 1, wire.to?.spec.width ?? 1);
  const middle = midpoint(wire.points);

  // A bus shows its value; a single bit only speaks up when colour alone would
  // not be enough — an X, or a floating net.
  const label = bits > 1 ? value || `${bits}b` : valueGlyph(value);
  const baseWidth = bits > 1 ? 5 : 3;

  return (
    <g>
      <path
        d={smoothPath(wire.points)}
        fill="none"
        vectorEffect="non-scaling-stroke"
        // Buses are drawn thicker, so a 4-bit link reads as one at a glance.
        strokeWidth={selected ? baseWidth + 1.5 : baseWidth}
        strokeDasharray={value.includes("Z") ? "5 4" : undefined}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cn(
          faulted || value.includes("X")
            ? "stroke-destructive"
            : selected
              ? "stroke-primary"
              : value.includes("1")
                ? "stroke-primary"
                : "stroke-muted-foreground",
          // A `0` is dim and a `1` is bright, which is the fastest read on a
          // schematic; selection overrides both so it stays visible either way.
          !selected && value === "0" && "opacity-60",
        )}
      />

      {label && (
        <text
          x={middle.x}
          y={middle.y - 3}
          textAnchor="middle"
          className={cn(
            "text-[7px] font-bold tabular-nums",
            value.includes("X") ? "fill-destructive" : "fill-muted-foreground",
          )}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * Where the value label sits: the middle of the *longest* segment, not the
 * middle vertex. A diagonal wire's vertices bunch up near its bends, and a
 * label parked on one of those lands on top of the node it just left.
 */
function midpoint(points: readonly Point[]): Point {
  let best = 0;
  let bestLength = -1;

  for (let i = 0; i + 1 < points.length; i++) {
    const length = Math.hypot(
      points[i + 1].x - points[i].x,
      points[i + 1].y - points[i].y,
    );
    if (length > bestLength) {
      bestLength = length;
      best = i;
    }
  }

  return {
    x: (points[best].x + points[best + 1].x) / 2,
    y: (points[best].y + points[best + 1].y) / 2,
  };
}

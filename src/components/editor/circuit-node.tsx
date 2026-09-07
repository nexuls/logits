"use client";

import { useMemo } from "react";

import { nodeView, valueClass } from "@/components/nodes/node-views";
import { GRID_SIZE } from "@/lib/circuit/geometry";
import { cn } from "@/lib/utils";
import { updateNodeParams } from "@/state/document";
import type { ResolvedNode } from "@/state/scene";
import { useNodeValues } from "@/state/simulation";

type Props = {
  resolved: ResolvedNode;
  selected: boolean;
  /** A diagnostic names this node — it gets a marker, not only a colour. */
  faulted: boolean;
  /** False while no document is open, which disables the interactive views. */
  interactive: boolean;
  /** `nodeId/pinId` keys a wire in progress could legally land on. */
  compatiblePinIds: ReadonlySet<string>;
  wiring: boolean;
  onFocus: () => void;
  /**
   * Enter on a focused pin — the keyboard path to wiring. The first call
   * starts a wire, the second completes it, exactly as a drag does.
   */
  onPinActivate: (pinId: string) => void;
};

/**
 * One node, drawn in world coordinates inside the canvas's transformed layer.
 *
 * DOM rather than `<canvas>` so a node can hold real controls and real focus
 * (ADR 0003). It renders entirely from the `ResolvedNode` — size, pins, title
 * — and never sees a `type` string, so there is nothing here to special-case a
 * node on (Non-negotiable #4). Anything a node wants to draw for itself comes
 * from its `view`, resolved by `node-views.tsx`.
 *
 * The body is `pointer-events: none`: picking is done mathematically against
 * the scene in `use-editor-gestures.ts`, which is the only way a hit target
 * can stay the same physical size at every zoom. The exceptions are the parts
 * that genuinely take input — a switch, a button — which opt back in and stop
 * the event so a click toggles instead of starting a drag.
 */
export default function CircuitNode({
  resolved,
  selected,
  faulted,
  interactive,
  compatiblePinIds,
  wiring,
  onFocus,
  onPinActivate,
}: Props) {
  const { node, def, bounds, pins } = resolved;

  const pinIds = useMemo(() => pins.map((pin) => pin.spec.id), [pins]);
  const values = useNodeValues(node.id, pinIds);
  const valueByPin = useMemo(() => {
    const parts = values.length > 0 ? values.split(" ") : [];
    return Object.fromEntries(
      pinIds.map((id, index) => [id, parts[index] ?? ""]),
    );
  }, [pinIds, values]);

  const View = nodeView(def.view);
  const title = node.label ?? def.title;

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    >
      {/* The focus target, over the body but never under the pointer: it is a
          real button so the keyboard reaches it, while selection and dragging
          stay with the scene hit-test on the viewport. It is a sibling of the
          body rather than its parent so a node view's own controls are not
          nested inside a button. */}
      <button
        type="button"
        aria-pressed={selected}
        aria-label={ariaLabel(title, def.title, pinIds, valueByPin)}
        onFocus={onFocus}
        className="pointer-events-none absolute inset-0 z-10 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />

      <div
        className={cn(
          "pointer-events-none absolute inset-0 rounded-[4px] border-2 bg-card/90",
          "flex items-center justify-center text-center",
          selected
            ? "border-primary ring-2 ring-primary/40"
            : faulted
              ? "border-destructive"
              : "border-border",
        )}
      >
        {View ? (
          <div className="pointer-events-auto absolute inset-[6px]">
            <View
              node={node}
              def={def}
              readPin={(pinId) => valueByPin[pinId] ?? ""}
              setParams={(patch) => updateNodeParams(node.id, patch)}
              interactive={interactive}
            />
          </div>
        ) : (
          <span className="truncate px-1 text-[10px] font-medium leading-none">
            {title}
          </span>
        )}

        {faulted && (
          // A marker as well as the border colour: state is never carried by
          // colour alone (AGENTS.md, Accessibility).
          <span
            aria-hidden
            className="absolute -top-2 -right-1.5 rounded-full bg-destructive px-1 text-[8px] font-bold leading-tight text-destructive-foreground"
          >
            !
          </span>
        )}

        {resolved.unknownType && (
          <span className="absolute -bottom-3 left-0 text-[7px] text-destructive">
            unknown type
          </span>
        )}
      </div>

      {pins.map((pin) => {
        const value = valueByPin[pin.spec.id] ?? "";
        // While a wire is being drawn the pins it could land on are lifted and
        // the rest are dimmed, so the legal targets are obvious before the drop.
        const candidate = compatiblePinIds.has(`${node.id}/${pin.spec.id}`);
        return (
          <button
            key={pin.spec.id}
            type="button"
            // Wiring by pointer is hit-tested against the scene, so this takes
            // no pointer events; it exists for Tab-and-Enter and the tooltip.
            // `click` still fires from the keyboard on a focused button.
            className={cn(
              "pointer-events-none absolute size-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-current bg-card outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              valueClass(value),
              wiring &&
                (candidate
                  ? "scale-150 border-2 border-primary text-primary"
                  : "opacity-30"),
            )}
            style={{
              left: pin.world.x - bounds.x,
              top: pin.world.y - bounds.y,
            }}
            onClick={() => onPinActivate(pin.spec.id)}
            data-node-id={node.id}
            data-pin-id={pin.spec.id}
            aria-label={`${title} pin ${pin.spec.name}${value ? `, ${value}` : ""}`}
            title={`${pin.spec.name} (${pin.spec.direction}, ${pin.spec.width}-bit)${value ? ` = ${value}` : ""}`}
          />
        );
      })}

      {node.label && def.view && (
        <span
          className="pointer-events-none absolute left-1/2 w-max -translate-x-1/2 text-[8px] text-muted-foreground"
          style={{ top: bounds.height + GRID_SIZE / 4 }}
        >
          {node.label}
        </span>
      )}
    </div>
  );
}

function ariaLabel(
  title: string,
  typeTitle: string,
  pinIds: readonly string[],
  values: Record<string, string>,
): string {
  const described = pinIds
    .map((id) => `${id} ${values[id] || "unknown"}`)
    .join(", ");
  return `${title} (${typeTitle})${described ? `, pins: ${described}` : ""}`;
}

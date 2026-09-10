"use client";

import { useMemo } from "react";

import { nodeView, valueClass } from "@/components/nodes/node-views";
import { GRID_SIZE, orientationOf, type Rect } from "@/lib/circuit/geometry";
import { PIN_LABEL_GAP } from "@/lib/nodes/label-metrics";
import { cn } from "@/lib/utils";
import { updateNodeParams } from "@/state/document";
import type { ResolvedNode, ResolvedPin } from "@/state/scene";
import { useNodeValues } from "@/state/simulation";

type Props = {
  resolved: ResolvedNode;
  selected: boolean;
  /** A diagnostic names this node — it gets a marker, not only a colour. */
  faulted: boolean;
  /** False while no document is open, which disables the interactive views. */
  interactive: boolean;
  /** Pin names on elements whose pins are obvious from their shape. */
  showBasicPinLabels: boolean;
  /** Pin names on elements whose pins are told apart only by name. */
  showCompoundPinLabels: boolean;
  /** The cursor is over this node, which is what reveals floating pin names. */
  hovered: boolean;
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
 * node on (Non-negotiable #4).
 *
 * What is *inside* the body is never decided here: every element names a
 * `view`, resolved by `node-views.tsx`, and the ones with no symbol of their
 * own name the block — a rectangle with the element's name in it. This file
 * draws the frame around that, the pins, and the two markers, and nothing
 * else, so giving an element a real symbol never touches the canvas.
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
  showBasicPinLabels,
  showCompoundPinLabels,
  hovered,
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

  // Where an element's pin names go is a property it declares, not a list of
  // types kept here. A floating label hangs outside the body and is drawn only
  // while the node is under the cursor or selected: on a switch, an LED or a
  // keypad the body *is* the reading, and a name written across it — or a
  // permanent fringe of names around it — hides what the user came to see.
  //
  // Deliberately not answerable to the `kind` switches below. Those say
  // whether an element that carries its names is worth the ink, and a floating
  // element carries none until it is pointed at; letting the switch pin them
  // up would put a compound element like `io.keypad` — which never declared a
  // `kind`, so it defaults to the one that is on — straight back to always-on,
  // which is the thing floating exists to avoid.
  const floatingLabels = def.pinLabels === "floating";

  // Which switch a pinned element answers to: a `kind` it never set means
  // "compound", so a node whose author did not think about it is labelled
  // rather than left mute.
  const showPinLabels = floatingLabels
    ? hovered || selected
    : def.kind === "basic"
      ? showBasicPinLabels
      : showCompoundPinLabels;

  // What the *view* is told, which is not the same question: it reserves
  // gutters for the names it has to make room for, and a floating name takes
  // no room from the body at all.
  const showInlinePinLabels = showPinLabels && !floatingLabels;

  const orientation = orientationOf(node.rotation);

  // The body says what the element *is*; `node.label` says which one it is,
  // and hangs under the body where nothing competes with it. Keeping the two
  // apart is what stops a renamed gate truncating its own name against a pin
  // label, and it means the same node reads the same whether or not it has a
  // custom view.
  const name = node.label ?? def.title;

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
        aria-label={ariaLabel(name, def.title, pinIds, valueByPin)}
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
        <div className="pointer-events-auto absolute inset-[6px]">
          <View
            node={node}
            def={def}
            resolved={resolved}
            orientation={orientation}
            showPinLabels={showInlinePinLabels}
            readPin={(pinId) => valueByPin[pinId] ?? ""}
            setParams={(patch) => updateNodeParams(node.id, patch)}
            interactive={interactive}
          />
        </div>

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
              "pointer-events-none absolute size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-current bg-card outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              valueClass(value),
              wiring &&
                (candidate
                  ? "scale-150 border-primary text-primary"
                  : "opacity-30"),
            )}
            style={{
              left: pin.world.x - bounds.x,
              top: pin.world.y - bounds.y,
            }}
            onClick={() => onPinActivate(pin.spec.id)}
            data-node-id={node.id}
            data-pin-id={pin.spec.id}
            aria-label={`${name} pin ${pin.spec.name}${value ? `, ${value}` : ""}`}
            title={`${pin.spec.name} (${pin.spec.direction}, ${pin.spec.width}-bit)${value ? ` = ${value}` : ""}`}
          />
        );
      })}

      {showPinLabels &&
        pins.map((pin) =>
          pin.spec.name ? (
            // Inline: inside the body, not outside it — the outside of a pin
            // is where its wire leaves, and a label there would sit under
            // every route into the node, which is why the body reserves a
            // gutter for it. Floating: outside, where nothing is reserved,
            // which is affordable because it is only drawn for the one node
            // under the cursor rather than for all of them at once.
            //
            // `pin.side` is post-rotation either way, so a turned node labels
            // its pins along the edges they actually ended up on, and the
            // text stays upright at every angle.
            //
            // On its own opaque chip, because what is underneath varies: a
            // scope's waveform, a seven-segment digit, the body title, a wire
            // running past. The node's own background is the one colour
            // guaranteed to sit under every pin, and it works in both themes
            // without a second token.
            <span
              key={pin.spec.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute w-max rounded-[2px] bg-card px-[1px] text-[7px] leading-[1.4] font-medium text-foreground/75",
                floatingLabels
                  ? FLOATING_PIN_LABEL_CLASS[pin.side]
                  : PIN_LABEL_CLASS[pin.side],
                // Floating labels sit over the wires they name, so they get
                // the node's border under them as well as its background.
                floatingLabels && "z-10 border border-border/60 px-[2px]",
              )}
              style={pinLabelPosition(pin, bounds, floatingLabels)}
            >
              {pin.spec.name}
            </span>
          ) : null,
        )}

      {node.label && (
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

/** Pushes an inline label off the edge it is anchored to, back into the body. */
const PIN_LABEL_CLASS: Record<ResolvedPin["side"], string> = {
  left: "-translate-y-1/2",
  right: "-translate-x-full -translate-y-1/2",
  top: "-translate-x-1/2",
  bottom: "-translate-x-1/2 -translate-y-full",
};

/** The same, mirrored: a floating label hangs off the outside of its edge. */
const FLOATING_PIN_LABEL_CLASS: Record<ResolvedPin["side"], string> = {
  left: "-translate-x-full -translate-y-1/2",
  right: "-translate-y-1/2",
  top: "-translate-x-1/2 -translate-y-full",
  bottom: "-translate-x-1/2",
};

/**
 * Node-relative placement of a pin's label: just inside the body, or — when
 * the element floats its labels — the same gap on the other side of the pin.
 */
function pinLabelPosition(pin: ResolvedPin, bounds: Rect, floating: boolean) {
  const x = pin.world.x - bounds.x;
  const y = pin.world.y - bounds.y;
  const gap = floating ? -PIN_LABEL_GAP : PIN_LABEL_GAP;

  switch (pin.side) {
    case "left":
      return { left: x + gap, top: y };
    case "right":
      return { left: x - gap, top: y };
    case "top":
      return { left: x, top: y + gap };
    default:
      return { left: x, top: y - gap };
  }
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

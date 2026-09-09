"use client";

import { useMemo } from "react";

import { nodeView, valueClass } from "@/components/nodes/node-views";
import { GRID_SIZE, type Rect } from "@/lib/circuit/geometry";
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
  showBasicPinLabels,
  showCompoundPinLabels,
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

  // Which switch this node answers to is a property it declares, not a list of
  // types kept here: a `kind` it never set means "compound", so a node whose
  // author did not think about it is labelled rather than left mute.
  const showPinLabels =
    def.kind === "basic" ? showBasicPinLabels : showCompoundPinLabels;

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
          <span
            className="line-clamp-2 text-[10px] leading-[1.15] font-medium break-words"
            // Reserving the gutter rather than letting the two overlap: the
            // title is centred and the labels are pinned to the edges, so on a
            // narrow body they collide, and a title wrapped to fit is legible
            // where a title crossed out by an `A1` is not. Two lines, because
            // what is left of an 8-cell body between two gutters is about six
            // characters wide and most titles here are longer than that.
            style={titlePadding(pins, showPinLabels)}
          >
            {def.title}
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
            // Inside the body, not outside it: the outside of a pin is where
            // its wire leaves, and a label there would sit under every route
            // into the node. `pin.side` is post-rotation, so a turned node
            // labels its pins along the edges they actually ended up on, and
            // the text stays upright at every angle.
            //
            // On its own opaque chip, because what is underneath varies: a
            // scope's waveform, a seven-segment digit, the body title. The
            // node's own background is the one colour guaranteed to sit under
            // every pin, and it works in both themes without a second token.
            <span
              key={pin.spec.id}
              aria-hidden
              className={cn(
                "pointer-events-none absolute w-max rounded-[2px] bg-card px-[1px] text-[7px] leading-[1.4] font-medium text-foreground/75",
                PIN_LABEL_CLASS[pin.side],
              )}
              style={pinLabelPosition(pin, bounds)}
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

/**
 * How far a pin label sits from its pin, in world units — clear of the 9px
 * pin dot, whose own edge is 4.5px in.
 */
const PIN_LABEL_GAP = 7;

/**
 * A pin label's width, in world units: the chip's own padding plus about five
 * units per character at the 7px font it uses. Measured against the widest
 * names in the catalogue (`COUT`, `LOAD`) rather than computed — this only
 * sets the padding a *centred, wrapping* title is laid out in, and measuring
 * text honestly would mean a layout pass per node per frame.
 */
const PIN_LABEL_PAD = 2;

/** `border-2` on the body, in world units. */
const BODY_BORDER_WIDTH = 2;

/**
 * Characters a pin name draws, which is not its `length`: `Q̅` is a `Q` and a
 * combining macron, two code points wide and one glyph wide, and taking the
 * string at its word gives a flip-flop a gutter for a name twice the size of
 * the one on screen.
 */
function labelChars(name: string): number {
  return [...name.replace(/\p{M}/gu, "")].length;
}
const PIN_LABEL_CHAR = 5.1;

/**
 * Room the body's title gives up, per side, to the labels on that edge.
 *
 * Per side and sized to the names actually there, rather than one worst-case
 * gutter: a flip-flop whose vertical edges say `D` and `Q` keeps its title on
 * one line, where a gutter wide enough for `COUT` would have broken it in
 * half. Only left and right edges take room — a top or bottom label sits above
 * or below the title, not beside it.
 */
function titlePadding(
  pins: readonly ResolvedPin[],
  showPinLabels: boolean,
): { paddingLeft: number; paddingRight: number } {
  const gutter = (side: ResolvedPin["side"]) => {
    const widest = pins
      .filter((pin) => pin.side === side && pin.spec.name)
      .reduce((max, pin) => Math.max(max, labelChars(pin.spec.name)), 0);
    // Less the border: a pin sits on the body's outer edge, so the label is
    // placed from there, while this padding is measured inside the border box.
    return widest === 0
      ? 4
      : PIN_LABEL_GAP +
          PIN_LABEL_PAD +
          widest * PIN_LABEL_CHAR -
          BODY_BORDER_WIDTH;
  };

  return showPinLabels
    ? { paddingLeft: gutter("left"), paddingRight: gutter("right") }
    : { paddingLeft: 4, paddingRight: 4 };
}

/** Pushes the label off the edge it is anchored to, per side. */
const PIN_LABEL_CLASS: Record<ResolvedPin["side"], string> = {
  left: "-translate-y-1/2",
  right: "-translate-x-full -translate-y-1/2",
  top: "-translate-x-1/2",
  bottom: "-translate-x-1/2 -translate-y-full",
};

/** Node-relative placement of a pin's label, just inside the body. */
function pinLabelPosition(pin: ResolvedPin, bounds: Rect) {
  const x = pin.world.x - bounds.x;
  const y = pin.world.y - bounds.y;

  switch (pin.side) {
    case "left":
      return { left: x + PIN_LABEL_GAP, top: y };
    case "right":
      return { left: x - PIN_LABEL_GAP, top: y };
    case "top":
      return { left: x, top: y + PIN_LABEL_GAP };
    default:
      return { left: x, top: y - PIN_LABEL_GAP };
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

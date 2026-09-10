import type { ComponentType } from "react";

import type { CircuitNode } from "@/lib/circuit/schema";
import { BLOCK_VIEW, type NodeDefinition } from "@/lib/nodes/define";
import type { ResolvedNode } from "@/state/scene";
import BargraphView from "./bargraph-view";
import BlockView from "./block-view";
import KeypadView from "./keypad-view";
import LampView from "./lamp-view";
import MatrixView from "./matrix-view";
import PushButtonView from "./push-button-view";
import ReadoutView from "./readout-view";
import ScopeView from "./scope-view";
import SegmentReadoutView from "./segment-readout-view";
import SevenSegmentView from "./seven-segment-view";
import ToggleView from "./toggle-view";
import TunnelView from "./tunnel-view";

/**
 * How each element draws itself.
 *
 * The same indirection as `node-icons.tsx`, for the same reason: a definition
 * names one with a `view` string because `src/lib/nodes/` may not import
 * React, and this file is the one place that maps names to components. Keys
 * name a *behaviour* or a *shape* — "lamp", "readout", "block" — never a node
 * `type`, so two elements that look alike share one entry (Non-negotiable #4).
 *
 * Every element has a view, and most of them name `"block"`: a rectangle with
 * the element's name in it, which is what the catalogue is drawn as until a
 * real symbol is designed for it. That makes the elements still waiting for a
 * symbol exactly the ones that say `view: "block"`, and designing one is a
 * component beside this file, a line here, and a line in the definition —
 * nothing in the canvas, the engine or the palette changes.
 */

export type NodeViewProps = {
  node: CircuitNode;
  def: NodeDefinition;
  /**
   * The node's geometry, rotation already applied: `bounds` in world units,
   * and `pins` on the edges they actually ended up on. A view that has to lay
   * anything out reads it from here rather than re-deriving it — the scene
   * computed it once for the whole frame.
   */
  resolved: ResolvedNode;
  /**
   * Which way round the element is: `"vertical"` after a quarter turn. A
   * symbol that has a direction — a gate pointing right, an arrowhead — draws
   * itself along this axis; a symmetric one can ignore it.
   */
  orientation: "horizontal" | "vertical";
  /** Whether the canvas is drawing this element's pin names right now. */
  showPinLabels: boolean;
  /**
   * The value on each pin's net, MSB first — `"0"`, `"1011"`, `"X"`, or `""`
   * when nothing is compiled yet. A view reads only the pins it draws.
   */
  readPin: (pinId: string) => string;
  /**
   * Edits this node's params through the document command, so the change
   * undoes and autosaves like any other. A view must never call `ctx.write`
   * or reach into the engine — see artifacts/05-node-authoring-guide.md.
   */
  setParams: (patch: Record<string, unknown>) => void;
  /** False when the editor is in a state where input would go nowhere. */
  interactive: boolean;
};

export type NodeView = ComponentType<NodeViewProps>;

const NODE_VIEWS: Record<string, NodeView> = {
  [BLOCK_VIEW]: BlockView,
  toggle: ToggleView,
  "push-button": PushButtonView,
  lamp: LampView,
  readout: ReadoutView,
  bargraph: BargraphView,
  keypad: KeypadView,
  matrix: MatrixView,
  "seven-segment": SevenSegmentView,
  "seven-segment-readout": SegmentReadoutView,
  scope: ScopeView,
  tunnel: TunnelView,
};

/**
 * The renderer for a view name. Falls back to the block — the labelled
 * rectangle every element starts as — for a definition that names none, and
 * for one naming a view this build does not have, so an element from a newer
 * save still draws as a box with its name rather than as nothing at all.
 */
export function nodeView(name: string | undefined): NodeView {
  return (name && NODE_VIEWS[name]) || BlockView;
}

/**
 * The class for a value, shared by every view and by the wire layer, so a `1`
 * is the same colour wherever it appears.
 *
 * Colour is never the only signal (accessibility, and the app is dark-first):
 * `X` and `Z` carry a glyph as well, which is what `valueGlyph` is for.
 */
export function valueClass(value: string): string {
  if (value.length === 0) return "text-muted-foreground";
  if (value.includes("X")) return "text-destructive";
  if (value.split("").every((bit) => bit === "Z"))
    return "text-muted-foreground";
  if (value.includes("1")) return "text-primary";
  return "text-muted-foreground";
}

/** A marker for the states colour alone must not have to carry. */
export function valueGlyph(value: string): string | null {
  if (value.includes("X")) return "!";
  if (value.length > 0 && value.split("").every((bit) => bit === "Z")) {
    return "~";
  }
  return null;
}

/** Human-readable, for `aria-label` and tooltips. */
export function describeValue(value: string): string {
  if (value.length === 0) return "not simulated";
  if (value.includes("X")) return `unknown (${value})`;
  if (value.split("").every((bit) => bit === "Z")) return "floating";
  return value;
}

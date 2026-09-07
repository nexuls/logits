import type { ComponentType } from "react";

import type { CircuitNode } from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
import LampView from "./lamp-view";
import PushButtonView from "./push-button-view";
import ReadoutView from "./readout-view";
import ToggleView from "./toggle-view";

/**
 * Custom renderers for nodes that display or accept data.
 *
 * The same indirection as `node-icons.tsx`, for the same reason: a definition
 * names one with a `view` string because `src/lib/nodes/` may not import
 * React, and this file is the one place that maps names to components. Keys
 * name a *behaviour* — "lamp", "readout" — never a node `type`, so a new
 * indicator reuses an entry here instead of adding one (Non-negotiable #4).
 *
 * Most nodes have no `view` at all and are drawn by the generic renderer from
 * `size()`, `title` and pins. Reach for one only when the node genuinely shows
 * a value or takes a click.
 */

export type NodeViewProps = {
  node: CircuitNode;
  def: NodeDefinition;
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
  toggle: ToggleView,
  "push-button": PushButtonView,
  lamp: LampView,
  readout: ReadoutView,
};

/** Null for a node with no custom view, or one naming a view this build lacks. */
export function nodeView(name: string | undefined): NodeView | null {
  return (name && NODE_VIEWS[name]) || null;
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

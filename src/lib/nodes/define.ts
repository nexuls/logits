import type { Size } from "@/lib/circuit/geometry";
import type {
  CircuitDocument,
  CircuitNode,
  PinSpec,
} from "@/lib/circuit/schema";
import type { Signal } from "@/lib/sim/logic";

/**
 * The node definition contract: everything the app knows about a node type.
 *
 * See artifacts/05-node-authoring-guide.md.
 */

export type NodeParams = CircuitNode["params"];

/**
 * One editable parameter, as the inspector should present it.
 *
 * Declarative on purpose: the inspector renders whatever a definition lists
 * and knows no node types, so a new node gains an editor without any component
 * changing (Non-negotiable #3). It is deliberately a small closed set of kinds
 * rather than a zod schema — the inspector has to pick a *control*, and a zod
 * type does not say whether an integer wants a stepper or a slider.
 */
export type ParamSpec =
  | {
      key: string;
      label: string;
      kind: "int";
      min?: number;
      max?: number;
      step?: number;
      /** Shown under the control; keep it to a phrase. */
      hint?: string;
    }
  | { key: string; label: string; kind: "bool"; hint?: string }
  | {
      key: string;
      label: string;
      kind: "text";
      maxLength?: number;
      hint?: string;
    }
  | {
      key: string;
      label: string;
      kind: "select";
      options: readonly { value: string; label: string }[];
      hint?: string;
    }
  | {
      key: string;
      label: string;
      kind: "color";
      /**
       * `swatch` is a CSS colour value — a token like
       * `var(--logit-led-green)`, never a class name — so the swatch the
       * inspector draws and the colour the node's own view renders come from
       * this one list. Adding a colour stays a one-file change.
       */
      options: readonly { value: string; label: string; swatch: string }[];
      hint?: string;
    };

/**
 * Node-owned mutable state, surviving between evaluations and re-created by
 * `createState` on reset. Deliberately untyped rather than a generic parameter
 * on `NodeDefinition`: a generic would make `registry.ts` an array of mutually
 * unassignable types, and each definition is the only code that ever reads its
 * own state, so it is the only code a cast could mislead.
 */
export type NodeState = Record<string, unknown>;

/**
 * What `evaluate` is handed. Mirrors artifacts/04-simulation-engine.md.
 *
 * `read` returns a fresh copy sized to the pin, so a node may keep a reference
 * to what it read — comparing this clock edge against the last one is the
 * normal way to write a flip-flop — without aliasing the engine's net buffer.
 */
export type EvalContext = {
  /** Integer nanoseconds. */
  now: number;
  params: NodeParams;
  state: NodeState;
  read: (pinId: string) => Signal;
  /** `delayNs` here is extra, on top of the node's own reaction delay. */
  write: (pinId: string, value: Signal, delayNs?: number) => void;
  /** Re-evaluate this node later with no input change — clocks, one-shots. */
  scheduleSelf: (delayNs: number) => void;
  emitSample?: (channel: string, value: Signal) => void;
};

export type NodeDefinition = {
  /** Registry key, `"<family>.<name>"`. Stable forever — it is in save files. */
  type: string;
  title: string;
  category: string;
  keywords?: readonly string[];
  /**
   * Long-form help for this node, as Markdown — what it is, how it behaves at
   * the edges, and how to wire it up on the canvas. The palette's info dialog
   * renders it (GFM, so tables work) alongside the pin and parameter tables it
   * derives from `pins` and `paramsSchema`, which is why nothing here should
   * restate those: document *behaviour*, not the pin list.
   *
   * A string on the definition rather than a `.md` file beside it, so adding a
   * node still touches exactly two files, and Markdown rather than JSX for the
   * same reason `icon` and `view` are names: this layer may not import React.
   */
  docs?: string;
  /**
   * Name of the palette icon for this node, resolved by
   * `src/components/nodes/node-icons.tsx`. A name and not a component, because
   * this layer must stay free of React. Names a shape (`"and"`, `"lamp"`), so
   * nodes that look alike share one; an unknown name falls back to a generic
   * part rather than breaking the palette.
   */
  icon?: string;
  defaultParams: NodeParams;
  /**
   * The parameters the inspector offers, in the order it shows them. Omit for
   * a node with nothing to configure; a param missing from this list is still
   * honoured, it just has no editor.
   */
  paramsSchema?: readonly ParamSpec[];
  /**
   * Name of the custom renderer for this node, resolved by
   * `src/components/nodes/node-views.tsx`. A name and not a component, for the
   * same reason `icon` is: this layer must stay free of React. Omit for the
   * generic renderer, which draws `title` and the pins — only a node that
   * genuinely *displays* or *accepts* data needs one.
   */
  view?: string;
  /** Pin layout is derived from params, never stored in the document. */
  pins: (params: NodeParams) => PinSpec[];
  /**
   * Named net joins: pin id → net name. Every pin in the document that names
   * the same net is merged into one net with no wire between them, which is
   * what a tunnel is.
   *
   * Declared here rather than recognised by `type` in `buildNetlist`, for the
   * same reason `tristate` is a `PinSpec` flag: the netlist must never learn a
   * node type (Non-negotiable #4). A blank or missing name joins nothing.
   */
  netAliases?: (params: NodeParams) => Record<string, string>;
  /**
   * Key into the document's `subcircuits` that this node instantiates, if it
   * is an instance at all.
   *
   * The other half of the same idea as `netAliases`: `buildNetlist` has to
   * inline user-defined chips, and it finds them by asking definitions rather
   * than by recognising a `type`. Only the synthesized definitions from
   * `src/lib/circuit/subcircuit.ts` answer.
   */
  subcircuit?: (params: NodeParams) => string | undefined;
  /**
   * The boundary pin this node stands for *inside* a subcircuit definition —
   * `sub.port` and nothing else. `name` is matched against the instance's pin
   * ids when the chip is inlined, `pinId` says which of this node's own pins
   * carries the signal across the boundary, and `direction` is the pin the
   * *instance* presents, from the chip's point of view. It has to be declared
   * rather than read off the pin, because the pin itself is `inout`: a port is
   * a join, not a driver, and a port that claimed to drive would short against
   * whatever the parent has wired to it.
   */
  boundaryPort?: (
    params: NodeParams,
  ) => { name: string; pinId: string; direction: "in" | "out" } | undefined;
  /** In grid cells. Must leave room for every pin `pins()` returns. */
  size: (params: NodeParams) => Size;
  /**
   * Nanoseconds from an input changing to this node reacting. Omit for the
   * engine's `DEFAULT_DELAY_NS`. A function of params because `time.delay`
   * exists to make it one.
   */
  delayNs?: (params: NodeParams) => number;
  /** Omit for a stateless node. Called on every reset, never mid-run. */
  createState?: (params: NodeParams) => NodeState;
  /**
   * Reads inputs, writes outputs. Pure with respect to everything except
   * `state` and `write`: no module-level mutables, no `Math.random`, no
   * `Date`, no reaching into another node. Omit for a pure sink like an LED,
   * whose value the UI reads off the net.
   */
  evaluate?: (ctx: EvalContext) => void;
};

/**
 * Registry lookup. Passed in rather than imported so the scene layer does not
 * depend on `registry.ts`, which lets it be tested with a two-node fixture.
 */
export type NodeLookup = (type: string) => NodeDefinition | undefined;

const PLACEHOLDER_SIZE: Size = { width: 6, height: 4 };

/**
 * Stands in for a `type` the registry does not know — an older save, or a node
 * removed from the build. Its params are untouched so the document still
 * round-trips, and its pins are reconstructed by the scene from the wires that
 * reference them, so the circuit still renders wired up instead of collapsing.
 */
export function placeholderDefinition(type: string): NodeDefinition {
  return {
    type,
    title: type,
    category: "unknown",
    defaultParams: {},
    pins: () => [],
    size: () => PLACEHOLDER_SIZE,
  };
}

/**
 * Which pin ids each node is wired to — the only clue a placeholder has about
 * a vanished definition's pins. Sorted, so a placeholder's pin order does not
 * depend on wire iteration order.
 */
export function referencedPinsByNode(
  document: CircuitDocument,
): Map<string, string[]> {
  const byNode = new Map<string, string[]>();
  for (const wire of Object.values(document.wires)) {
    for (const ref of [wire.from, wire.to]) {
      const pins = byNode.get(ref.nodeId);
      if (!pins) byNode.set(ref.nodeId, [ref.pinId]);
      else if (!pins.includes(ref.pinId)) pins.push(ref.pinId);
    }
  }
  for (const pins of byNode.values()) pins.sort();
  return byNode;
}

/** Reconstructs a plausible left-side pin strip for an unknown node type. */
export function synthesizePins(pinIds: readonly string[]): PinSpec[] {
  return pinIds.map((id, index) => ({
    id,
    name: id,
    direction: "inout" as const,
    width: 1,
    side: "left" as const,
    offset: index + 1,
  }));
}

/**
 * A node's pin layout, whether or not its type is still in the registry. The
 * scene and the netlist must agree on this exactly — a wire the netlist ties
 * into a net has to land on a pin the canvas also draws — so they share it.
 */
export function pinSpecsFor(
  node: CircuitNode,
  lookup: NodeLookup,
  referencedPins?: readonly string[],
): PinSpec[] {
  const definition = lookup(node.type);
  return definition
    ? definition.pins(node.params)
    : synthesizePins(referencedPins ?? []);
}

/**
 * Authoring entry point for a definition. It is an identity function today —
 * its job is to be the single name every definition file imports, so the day
 * the contract grows `evaluate` and `paramsSchema` there is one place to widen
 * and every node file already routes through it.
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  return definition;
}

/**
 * Params are `z.json()` in the document, so a saved file can hold anything —
 * an older save, or a hand-edited one. Definitions read them through this
 * rather than casting, so a bad value degrades to the default instead of
 * producing `NaN` pins.
 */
export function boolParam(
  params: NodeParams,
  key: string,
  fallback: boolean,
): boolean {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

export function intParam(
  params: NodeParams,
  key: string,
  fallback: number,
): number {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;
}

export function stringParam(
  params: NodeParams,
  key: string,
  fallback: string,
): string {
  const value = params[key];
  return typeof value === "string" ? value : fallback;
}

/**
 * The CSS colour a node's `kind: "color"` param currently selects, or the
 * first option when the saved value is unknown.
 *
 * Lives here rather than in the view so the swatch the inspector draws and
 * the colour the node renders itself in cannot drift apart, and so a node
 * that wants a colour declares it in one place. Returns undefined for a
 * definition with no colour param at all.
 */
export function colorParam(
  def: NodeDefinition,
  params: NodeParams,
): string | undefined {
  const spec = def.paramsSchema?.find((entry) => entry.kind === "color");
  if (!spec || spec.kind !== "color") return undefined;

  const value = params[spec.key];
  const chosen = spec.options.find((option) => option.value === value);
  return (chosen ?? spec.options[0])?.swatch;
}

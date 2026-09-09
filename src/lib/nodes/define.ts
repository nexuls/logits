import type { Size } from "@/lib/circuit/geometry";
import {
  type CircuitDocument,
  type CircuitNode,
  isWireAnchor,
  type PinSpec,
} from "@/lib/circuit/schema";
import type { Signal } from "@/lib/sim/logic";
import { fitBody } from "./label-metrics";

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
  /**
   * The name the canvas writes on the body, when the full `title` is too long
   * to be one there — `"MUX"` for a multiplexer, `"DFF"` for a D flip-flop.
   *
   * The palette, the inspector and the docs dialog always use `title`: this is
   * only what the element is called *on a schematic*, where the conventional
   * abbreviation is both what fits and what a reader expects. Omit it for a
   * title that is already short.
   */
  shortTitle?: string;
  category: string;
  keywords?: readonly string[];
  /**
   * Whether this node's pins can be read off the picture.
   *
   * `"basic"` — a switch, an LED, a two-input gate: one pin to a side, or a
   * row of interchangeable inputs, so which pin is which follows from where it
   * is. `"compound"` — a flip-flop, a mux, a RAM: several pins on one edge
   * with genuinely different jobs, told apart by nothing but their names.
   *
   * It decides only whether the canvas draws the pin names *by default*; each
   * kind has its own switch in the editor settings, so either can be forced on
   * or off. Omitting it means `"compound"`, because a node whose author never
   * thought about this is far likelier to need its names shown than not —
   * over-labelling is a smaller failure than an unreadable one.
   *
   * Declared here, and read only by the node renderer, so no component has to
   * know which types are which (Non-negotiable #4).
   */
  kind?: "basic" | "compound";
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
   * Name of the renderer for this node's body, resolved by
   * `src/components/nodes/node-views.tsx`. A name and not a component, for the
   * same reason `icon` is: this layer must stay free of React.
   *
   * Every definition names one, and `BLOCK_VIEW` — the labelled rectangle — is
   * the honest default rather than a fallback nothing declares: it is what
   * says "this element is still drawn as a box", so the ones that have grown a
   * real symbol are the ones that name something else. A name this build does
   * not have falls back to the block rather than rendering nothing.
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
  return defineNode({
    type,
    title: type,
    category: "unknown",
    view: BLOCK_VIEW,
    defaultParams: {},
    pins: () => [],
    size: () => PLACEHOLDER_SIZE,
  });
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
      // A branch's `from` names a wire, not a pin, so it says nothing about
      // what pins a vanished node used to have.
      if (isWireAnchor(ref)) continue;

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
 * The renderer every element gets until someone draws it a real symbol: a
 * rectangle with the element's name in it. Named here because `defineNode`
 * has to know which view draws a title, and it is the only thing it knows
 * about any view.
 */
export const BLOCK_VIEW = "block";

/**
 * Authoring entry point for a definition. Every node file routes through it,
 * which is what lets the contract grow in one place.
 *
 * What it adds today is the guarantee behind "the block renders fine at every
 * rotation": a body drawn as a labelled box is widened until its name fits it,
 * so no definition has to hand-tune a footprint against the length of its own
 * title. A node with a real symbol is left exactly as written — it draws
 * something other than a name, and only its author knows how big that is.
 */
export function defineNode(definition: NodeDefinition): NodeDefinition {
  const view = definition.view ?? BLOCK_VIEW;
  if (view !== BLOCK_VIEW) return definition;

  const label = definition.shortTitle ?? definition.title;
  // Pin names are drawn by default on everything but a `"basic"` node, and
  // that default is what the footprint has to survive — a body sized for bare
  // pins would have its title cut in half the moment the labels came on.
  const labelled = definition.kind !== "basic";

  // Both `pins` and `size` are asked for the same params over and over — once
  // per netlist rebuild, once per scene layout — so the fit is computed once
  // per params object rather than on every call. Keyed by identity because
  // commands replace the params object on every edit, which makes identity an
  // exact "have these changed?" test.
  const fitted = new WeakMap<NodeParams, ReturnType<typeof fitBody>>();
  const fit = (params: NodeParams) => {
    const hit = fitted.get(params);
    if (hit) return hit;

    const result = fitBody(
      label,
      definition.pins(params),
      definition.size(params),
      labelled,
    );
    fitted.set(params, result);
    return result;
  };

  return {
    ...definition,
    view,
    pins: (params) => [...fit(params).pins],
    size: (params) => fit(params).size,
  };
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

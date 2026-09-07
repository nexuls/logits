import type { Size } from "@/lib/circuit/geometry";
import type { CircuitNode, PinSpec } from "@/lib/circuit/schema";

/**
 * The node definition contract, cut down to the surface the renderer needs.
 *
 * This is intentionally partial: `evaluate`, `createState`, `delayNs`,
 * `paramsSchema` and `view` are Phase 2/3 and are left out rather than guessed
 * at, because their signatures depend on the engine's four-valued types, which
 * do not exist yet. Adding them must not change what is here.
 * See artifacts/05-node-authoring-guide.md.
 */

export type NodeParams = CircuitNode["params"];

export type NodeDefinition = {
  /** Registry key, `"<family>.<name>"`. Stable forever — it is in save files. */
  type: string;
  title: string;
  category: string;
  keywords?: readonly string[];
  /**
   * Name of the palette icon for this node, resolved by
   * `src/components/nodes/node-icons.tsx`. A name and not a component, because
   * this layer must stay free of React. Names a shape (`"and"`, `"lamp"`), so
   * nodes that look alike share one; an unknown name falls back to a generic
   * part rather than breaking the palette.
   */
  icon?: string;
  defaultParams: NodeParams;
  /** Pin layout is derived from params, never stored in the document. */
  pins: (params: NodeParams) => PinSpec[];
  /** In grid cells. Must leave room for every pin `pins()` returns. */
  size: (params: NodeParams) => Size;
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

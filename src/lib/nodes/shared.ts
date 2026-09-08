import type { PinSpec } from "@/lib/circuit/schema";
import { HIGH, LOW, type LogicValue, Z } from "@/lib/sim/logic";
import type { NodeParams, ParamSpec } from "./define";
import { intParam } from "./define";

/**
 * Layout and param helpers shared by every family added in phase 4.
 *
 * Nothing here knows a node `type`: it is geometry and clamping, factored out
 * so twenty-odd definitions agree on pin pitch, body height and the shape of a
 * "Bit width" stepper instead of each re-deciding. The gate families have
 * their own copy of this in `gates/shared.ts` because their footprint is the
 * distinctive gate outline rather than a box.
 */

/** Two grid cells between stacked pins, so a wire can pass between them. */
export const PIN_PITCH = 2;

/** Minimum body height — a box shorter than this cannot hold its title. */
export const MIN_HEIGHT = 4;

/**
 * Arithmetic is done through `fromBits`/`toBits`, which are plain numbers, so
 * widths are capped where a double still represents every value exactly with
 * room for a carry. Bitwise nodes could go wider; one cap is less surprising.
 */
export const MAX_WIDTH = 32;

export function widthParam(hint?: string, max = MAX_WIDTH): ParamSpec {
  return { key: "width", label: "Bit width", kind: "int", min: 1, max, hint };
}

/** Clamped `width`, so a hand-edited file cannot produce a zero-wide pin. */
export function widthOf(params: NodeParams, max = MAX_WIDTH): number {
  return clampInt(intParam(params, "width", 1), 1, max);
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

/** Clamped integer param, in one call. */
export function boundedParam(
  params: NodeParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  return clampInt(intParam(params, key, fallback), min, max);
}

/** Body height for `count` pins stacked on one side at `PIN_PITCH`. */
export function stackHeight(count: number): number {
  return Math.max(MIN_HEIGHT, (count + 1) * PIN_PITCH);
}

/**
 * Evenly spaced pins down one side, centred in a body of `height`.
 *
 * Centred as a block rather than anchored to the top, so a mux's data inputs
 * stay symmetric about the body as `selectBits` grows.
 */
export function stack(
  pins: readonly Omit<PinSpec, "side" | "offset">[],
  side: PinSpec["side"],
  height: number,
): PinSpec[] {
  const top = (height - (pins.length - 1) * PIN_PITCH) / 2;
  return pins.map((pin, index) => ({
    ...pin,
    side,
    offset: top + index * PIN_PITCH,
  }));
}

/**
 * Positions along a horizontal edge for `count` control pins, so `rst`, `set`
 * and `en` share the top edge without landing on top of each other.
 */
export function spread(count: number, width: number): number[] {
  return Array.from(
    { length: count },
    (_, index) => (width * (index + 1)) / (count + 1),
  );
}

/**
 * What a control pin — `rst`, `set`, `en`, `load`, `oe` — is currently saying.
 *
 * The `Z` case is the one that matters and the one that is easy to get wrong.
 * An unwired control reads `Z`, and every control in the catalog has an
 * obvious "not wired" meaning: not reset, not loading, enabled. Folding `Z` in
 * with `X` would put a freshly placed flip-flop into permanent reset, which is
 * the opposite of useful. A genuinely contended control is still `"unknown"`,
 * because that one nobody can resolve.
 */
export function controlState(
  value: LogicValue,
): "asserted" | "idle" | "unknown" {
  if (value === HIGH) return "asserted";
  return value === LOW || value === Z ? "idle" : "unknown";
}

export const EDGE_PARAM: ParamSpec = {
  key: "edge",
  label: "Clock edge",
  kind: "select",
  options: [
    { value: "rising", label: "Rising" },
    { value: "falling", label: "Falling" },
  ],
};

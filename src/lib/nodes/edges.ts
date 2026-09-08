import { HIGH, LOW, type LogicValue, X, Z } from "@/lib/sim/logic";

/**
 * Clock-edge detection, four-valued.
 *
 * Every clocked node in the catalog compares the level it read last time
 * against the one it reads now, so the comparison — and in particular what an
 * `X` or a floating clock means — is written once here rather than once per
 * flip-flop.
 *
 * The third answer is the reason this is not a boolean: a clock that moves
 * from `X` to `1` *may* have been an edge, and a flip-flop that guessed either
 * way would be lying. `"unknown"` is what makes an uninitialised or contended
 * clock put `X` on `q` instead of silently latching.
 */

export type EdgeMode = "rising" | "falling" | "both";

export type EdgeResult = "none" | "edge" | "unknown";

/** `NO_LEVEL` is the state before a node has ever read its clock. */
export const NO_LEVEL = -1;

export function edgeMode(
  value: unknown,
  fallback: EdgeMode = "rising",
): EdgeMode {
  return value === "rising" || value === "falling" || value === "both"
    ? value
    : fallback;
}

export function detectEdge(
  previous: LogicValue | typeof NO_LEVEL,
  current: LogicValue,
  mode: EdgeMode,
): EdgeResult {
  // The very first evaluation only records the level. Treating it as an edge
  // would clock every flip-flop in the circuit once at t = 0.
  if (previous === NO_LEVEL || previous === current) return "none";

  // Coming out of high impedance is not an edge. `Z` is "nothing has driven
  // this yet", not "some level we cannot name", and every circuit starts
  // there: counting the first driven level as an edge would clock the whole
  // document once at power-up. Losing the drive is not an edge either.
  if (previous === Z || current === Z) return "none";

  // `X` is the other thing entirely — a contended or genuinely unknown level,
  // where an edge may or may not have happened and neither answer is honest.
  if (previous === X || current === X) return "unknown";

  const rising = previous === LOW && current === HIGH;
  return (mode === "rising" && rising) ||
    (mode === "falling" && !rising) ||
    mode === "both"
    ? "edge"
    : "none";
}

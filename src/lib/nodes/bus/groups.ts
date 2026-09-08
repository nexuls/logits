import type { ParamSpec } from "@/lib/nodes/define";
import { MAX_WIDTH } from "../shared";

/**
 * How a bus is cut up, as the document stores it: comma-separated lane counts,
 * least significant first. `"4,4"` splits an 8-bit bus into two nibbles;
 * `"1,1,1,1"` fans a nibble out to single bits.
 *
 * The bus width is the *sum* of the groups rather than a separate param, so a
 * split and the merge that undoes it cannot be configured into disagreeing.
 */

export const GROUPS_PARAM: ParamSpec = {
  key: "groups",
  label: "Groups",
  kind: "text",
  maxLength: 128,
  hint: "Lane counts, least significant first — e.g. 4,4 or 1,1,1,1.",
};

export function parseGroups(value: unknown): number[] {
  const text = typeof value === "string" ? value : "";
  const groups: number[] = [];
  let total = 0;

  for (const token of text.split(/[\s,]+/)) {
    if (token.length === 0) continue;
    const size = Number.parseInt(token, 10);
    if (!Number.isFinite(size) || size < 1) continue;
    // Truncated rather than rejected: a hand-edited file asking for 300 lanes
    // still has to produce pins the canvas can draw.
    if (total + size > MAX_WIDTH) break;
    groups.push(size);
    total += size;
  }

  return groups.length > 0 ? groups : [1, 1];
}

/** First bit index of each group, so a lane knows where it lands on the bus. */
export function groupOffsets(groups: readonly number[]): number[] {
  const offsets: number[] = [];
  let start = 0;
  for (const size of groups) {
    offsets.push(start);
    start += size;
  }
  return offsets;
}

export function totalWidth(groups: readonly number[]): number {
  return groups.reduce((sum, size) => sum + size, 0);
}

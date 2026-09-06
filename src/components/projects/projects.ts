import { format } from "date-fns";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/**
 * Relative timestamp for a project row.
 *
 * Deliberately terse — the sidebar column is narrow, and date-fns' prose
 * ("less than a minute ago") truncates to nothing useful at this width.
 *
 * Called during render rather than stored on the project, because "5m ago" is
 * only true for a minute. It must not run on the server: there is no
 * `localStorage` there, so no project reaches a server render, and that is what
 * keeps this from hydrating mismatched.
 */
export function formatUpdated(updatedAt: number, now = Date.now()): string {
  const elapsed = Math.max(0, now - updatedAt);

  if (elapsed < MINUTE) return "just now";
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)}m ago`;
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)}h ago`;
  if (elapsed < WEEK) return `${Math.floor(elapsed / DAY)}d ago`;

  return format(updatedAt, "d MMM");
}

export function formatNodeCount(nodeCount: number): string {
  return `${nodeCount} node${nodeCount === 1 ? "" : "s"}`;
}

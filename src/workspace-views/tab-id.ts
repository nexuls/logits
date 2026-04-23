/**
 * Tab-id encoding for the workspace.
 *
 * Format: `viewName:fileId[:k=v&k2=v2]`
 *
 * The first two segments are required and identify which view to mount and the
 * file it operates on. The optional third segment is a URL-encoded query
 * string, letting future views attach extra state (e.g. `range=10-20`) without
 * changing the registry contract.
 *
 * Tab ids are stored in localStorage and round-tripped via the URL, so this
 * format must remain backwards-compatible — only add new optional params.
 */

const SEPARATOR = ":";

export type ParsedTabId = {
  viewName: string;
  fileId: string;
  /** Empty object when the tab id has no third segment. */
  params: Record<string, string>;
};

/**
 * Build a tab id. Empty-valued params are stripped so equivalent inputs
 * produce identical ids (important because tab ids are used as React keys
 * and Set members).
 */
export function buildTabId(
  viewName: string,
  fileId: string,
  params?: Record<string, string>,
): string {
  const base = `${viewName}${SEPARATOR}${fileId}`;
  if (!params) return base;

  const entries = Object.entries(params).filter(([, value]) => value !== "");
  if (entries.length === 0) return base;

  const search = new URLSearchParams(entries).toString();
  return `${base}${SEPARATOR}${search}`;
}

/**
 * Parse a tab id, returning `null` for malformed strings so callers can drop
 * stale entries (e.g. from older storage formats) without throwing.
 */
export function parseTabId(tabId: string): ParsedTabId | null {
  const [viewName, fileId, paramString] = tabId.split(SEPARATOR);
  if (!viewName || !fileId) return null;

  const params: Record<string, string> = {};
  if (paramString) {
    new URLSearchParams(paramString).forEach((value, key) => {
      params[key] = value;
    });
  }

  return { viewName, fileId, params };
}

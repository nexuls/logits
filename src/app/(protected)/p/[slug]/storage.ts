/**
 * Per-notebook localStorage helpers for the workspace.
 *
 * The workspace persists two things for each notebook so a refresh restores
 * the user's session:
 *   - the open tab ids in their original order
 *   - the split/pane layout
 *
 * Storage keys are namespaced under `logits:` and keyed by notebook id so
 * notebooks never read each other's state.
 */

import type { WorkspaceLayout } from "@/components/workspace";
import { buildTabId, parseTabId } from "@/workspace-views/tab-id";

export const getNotebookTabStorageKey = (notebookId: string) =>
  `logits:open-tabs:${notebookId}`;

export const getNotebookWorkspaceStorageKey = (notebookId: string) =>
  `logits:workspace-layout:${notebookId}`;

/**
 * Read the persisted tab ids for `notebookId`, dropping any malformed entries.
 * Each surviving id is rebuilt with `buildTabId` so the canonical encoding is
 * restored if the stored format ever drifts.
 */
export function readStoredTabIds(notebookId: string) {
  if (typeof window === "undefined") return [];

  const storedTabs = window.localStorage.getItem(
    getNotebookTabStorageKey(notebookId),
  );
  if (!storedTabs) return [];

  try {
    const parsedTabs = JSON.parse(storedTabs);
    if (!Array.isArray(parsedTabs)) return [];

    return parsedTabs
      .map((rawTabId) => {
        if (typeof rawTabId !== "string") return null;
        const parsed = parseTabId(rawTabId);
        return parsed
          ? buildTabId(parsed.viewName, parsed.fileId, parsed.params)
          : null;
      })
      .filter((tabId): tabId is string => Boolean(tabId));
  } catch {
    return [];
  }
}

export function readStoredWorkspaceLayout(
  notebookId: string,
): WorkspaceLayout | null {
  if (typeof window === "undefined") return null;

  const storedLayout = window.localStorage.getItem(
    getNotebookWorkspaceStorageKey(notebookId),
  );
  if (!storedLayout) return null;

  try {
    const parsedLayout = JSON.parse(storedLayout);
    if (!parsedLayout || typeof parsedLayout !== "object") return null;
    return parsedLayout as WorkspaceLayout;
  } catch {
    return null;
  }
}

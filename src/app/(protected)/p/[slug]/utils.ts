import type { TabViewMode } from "@/data/file-selection";
import {
  getNotebookTabStorageKey,
  getNotebookWorkspaceStorageKey,
  getTabId,
} from "./holder";
import type { WorkspaceLayout } from "@/components/workspace";

export function parseTabId(
  tabId: string,
): { mode: TabViewMode; fileId: string } | null {
  const [rawMode, ...rest] = tabId.split(":");
  const fileId = rest.join(":");
  if (!fileId) return null;

  if (rawMode === "editor" || rawMode === "preview") {
    return { mode: rawMode, fileId };
  }

  return { mode: "editor", fileId: tabId };
}

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
        return parsed ? getTabId(parsed.fileId, parsed.mode) : null;
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

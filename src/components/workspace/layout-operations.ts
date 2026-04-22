import type { DropSide, WorkspaceLayout, WorkspacePaneNode } from "./types";

// Default percentage share assigned to the first child of a fresh split.
export const DEFAULT_SPLIT_SIZE = 50;

/**
 * Creates a new pane with a fresh id. Both `tabIds` and the initial
 * `activeTabId` are optional so the helper can be used for empty
 * placeholder panes as well as fully populated ones.
 */
export function createPane(
  tabIds: string[] = [],
  activeTabId: string | null = null,
): WorkspacePaneNode {
  return {
    id: crypto.randomUUID(),
    type: "pane",
    tabIds,
    activeTabId: activeTabId ?? tabIds[0] ?? null,
  };
}

/** Flatten the layout tree into the ordered list of every pane id. */
export function getPaneIds(layout: WorkspaceLayout | null): string[] {
  if (!layout) return [];
  if (layout.type === "pane") return [layout.id];
  return [...getPaneIds(layout.first), ...getPaneIds(layout.second)];
}

/** Locate a pane node by id. Returns `null` when not present. */
export function findPane(
  layout: WorkspaceLayout | null,
  paneId: string,
): WorkspacePaneNode | null {
  if (!layout) return null;
  if (layout.type === "pane") return layout.id === paneId ? layout : null;
  return findPane(layout.first, paneId) ?? findPane(layout.second, paneId);
}

/** Return the pane that currently owns the given tab id, if any. */
export function findPaneContainingTab(
  layout: WorkspaceLayout | null,
  tabId: string,
): WorkspacePaneNode | null {
  if (!layout) return null;
  if (layout.type === "pane") {
    return layout.tabIds.includes(tabId) ? layout : null;
  }
  return (
    findPaneContainingTab(layout.first, tabId) ??
    findPaneContainingTab(layout.second, tabId)
  );
}

/** Aggregate every tab id assigned somewhere in the layout. */
export function collectAssignedTabIds(
  layout: WorkspaceLayout | null,
): string[] {
  if (!layout) return [];
  if (layout.type === "pane") return layout.tabIds;
  return [
    ...collectAssignedTabIds(layout.first),
    ...collectAssignedTabIds(layout.second),
  ];
}

/**
 * Replace a specific pane with a new sub-layout produced by `updater`.
 * Useful for mutating a single pane (e.g. change its tab order) without
 * traversing / rewriting the whole tree at the call site.
 */
export function updatePane(
  layout: WorkspaceLayout | null,
  paneId: string,
  updater: (pane: WorkspacePaneNode) => WorkspaceLayout,
): WorkspaceLayout | null {
  if (!layout) return null;
  if (layout.type === "pane") {
    return layout.id === paneId ? updater(layout) : layout;
  }
  return {
    ...layout,
    first: updatePane(layout.first, paneId, updater) ?? layout.first,
    second: updatePane(layout.second, paneId, updater) ?? layout.second,
  };
}

/**
 * Prune empty panes, collapse splits with a single surviving child and
 * ensure every pane's active tab id references one of its tab ids.
 * Returns `null` if the whole tree ends up empty.
 */
export function normalizeLayout(
  layout: WorkspaceLayout | null,
): WorkspaceLayout | null {
  if (!layout) return null;

  if (layout.type === "pane") {
    if (layout.tabIds.length === 0) return null;
    return {
      ...layout,
      activeTabId:
        layout.activeTabId && layout.tabIds.includes(layout.activeTabId)
          ? layout.activeTabId
          : (layout.tabIds[0] ?? null),
    };
  }

  const first = normalizeLayout(layout.first);
  const second = normalizeLayout(layout.second);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

/**
 * Insert `tabId` at the given `index` within `tabIds`, removing any
 * previous occurrence first. Index is clamped to `[0, length]` and
 * defaults to the end of the list.
 */
export function insertTabAt(tabIds: string[], tabId: string, index?: number) {
  const nextTabIds = tabIds.filter((currentTabId) => currentTabId !== tabId);
  const clampedIndex =
    index === undefined
      ? nextTabIds.length
      : Math.max(0, Math.min(index, nextTabIds.length));
  nextTabIds.splice(clampedIndex, 0, tabId);
  return nextTabIds;
}

/**
 * Remove `tabId` from the pane that currently owns it, then normalize
 * the surrounding split (potentially collapsing it).
 */
export function removeTabFromLayout(
  layout: WorkspaceLayout | null,
  tabId: string,
): WorkspaceLayout | null {
  if (!layout) return null;

  if (layout.type === "pane") {
    if (!layout.tabIds.includes(tabId)) return layout;
    const nextTabIds = layout.tabIds.filter(
      (currentTabId) => currentTabId !== tabId,
    );
    return {
      ...layout,
      tabIds: nextTabIds,
      activeTabId:
        layout.activeTabId === tabId
          ? (nextTabIds[0] ?? null)
          : layout.activeTabId,
    };
  }

  return normalizeLayout({
    ...layout,
    first: removeTabFromLayout(layout.first, tabId) ?? layout.first,
    second: removeTabFromLayout(layout.second, tabId) ?? layout.second,
  });
}

/**
 * Replace the pane identified by `paneId` with a new split node. The
 * dragged pane (`newPane`) is placed on the side indicated by `side` and
 * the original pane takes the opposite slot.
 */
export function replacePaneWithSplit(
  layout: WorkspaceLayout | null,
  paneId: string,
  side: Exclude<DropSide, "center">,
  newPane: WorkspacePaneNode,
): WorkspaceLayout | null {
  if (!layout) return null;

  if (layout.type === "pane") {
    if (layout.id !== paneId) return layout;
    const direction =
      side === "left" || side === "right" ? "horizontal" : "vertical";
    const placeDraggedFirst = side === "left" || side === "top";
    return {
      id: crypto.randomUUID(),
      type: "split",
      direction,
      size: DEFAULT_SPLIT_SIZE,
      first: placeDraggedFirst ? newPane : layout,
      second: placeDraggedFirst ? layout : newPane,
    };
  }

  return {
    ...layout,
    first:
      replacePaneWithSplit(layout.first, paneId, side, newPane) ?? layout.first,
    second:
      replacePaneWithSplit(layout.second, paneId, side, newPane) ??
      layout.second,
  };
}

/** Convenience accessor — the id of the first pane encountered (DFS). */
export function getFirstPaneId(layout: WorkspaceLayout | null): string | null {
  return getPaneIds(layout)[0] ?? null;
}

// For a horizontal split, "first" is the left child and "second" is the
// right. For a vertical split, both children share the same left/right
// edge, so we descend into the top child (first) for stability.
export function getEdgePaneId(
  layout: WorkspaceLayout | null,
  edge: "left" | "right",
): string | null {
  if (!layout) return null;
  if (layout.type === "pane") return layout.id;
  if (layout.direction === "horizontal") {
    return getEdgePaneId(edge === "left" ? layout.first : layout.second, edge);
  }
  return getEdgePaneId(layout.first, edge);
}

/**
 * Given a pane and the tab about to be closed, pick the tab that should
 * become active next: prefer the one to the right, else the one to the
 * left, else null.
 */
export function getNextActiveTabId(
  layout: WorkspaceLayout | null,
  closedTabId: string,
  paneId: string,
): string | null {
  const pane = findPane(layout, paneId);
  if (!pane) return null;
  const currentIndex = pane.tabIds.indexOf(closedTabId);
  if (currentIndex === -1) return pane.activeTabId;
  return pane.tabIds[currentIndex + 1] ?? pane.tabIds[currentIndex - 1] ?? null;
}

/** Remove tab ids from panes that are no longer in the canonical set. */
export function pruneUnavailableTabs(
  layout: WorkspaceLayout,
  availableTabIds: Set<string>,
): WorkspaceLayout | null {
  if (layout.type === "pane") {
    const nextTabIds = layout.tabIds.filter((tabId) =>
      availableTabIds.has(tabId),
    );
    if (nextTabIds.length === 0) return null;
    return {
      ...layout,
      tabIds: nextTabIds,
      activeTabId:
        layout.activeTabId && nextTabIds.includes(layout.activeTabId)
          ? layout.activeTabId
          : (nextTabIds[0] ?? null),
    };
  }

  const first = pruneUnavailableTabs(layout.first, availableTabIds);
  const second = pruneUnavailableTabs(layout.second, availableTabIds);
  if (!first && !second) return null;
  if (!first) return second;
  if (!second) return first;
  return { ...layout, first, second };
}

/**
 * Reconcile an existing layout with the current canonical `tabIds`:
 * - drops tab ids that no longer exist
 * - inserts newly-opened tab ids into the focused / active pane
 * - makes sure the incoming `activeTabId` wins in its host pane
 */
export function syncLayoutWithTabs(
  layout: WorkspaceLayout | null,
  tabIds: string[],
  activeTabId: string | undefined,
  focusedPaneId: string | null,
): WorkspaceLayout {
  const existingLayout = normalizeLayout(layout);

  if (!existingLayout) {
    return createPane(tabIds, activeTabId ?? tabIds[0] ?? null);
  }

  let nextLayout = normalizeLayout(
    pruneUnavailableTabs(existingLayout, new Set(tabIds)),
  );

  if (!nextLayout) {
    return createPane(tabIds, activeTabId ?? tabIds[0] ?? null);
  }

  const assignedTabIds = new Set(collectAssignedTabIds(nextLayout));
  const missingTabIds = tabIds.filter((tabId) => !assignedTabIds.has(tabId));

  if (missingTabIds.length > 0) {
    const targetPaneId =
      (activeTabId
        ? findPaneContainingTab(nextLayout, activeTabId)?.id
        : null) ??
      focusedPaneId ??
      getFirstPaneId(nextLayout);

    if (targetPaneId) {
      nextLayout =
        updatePane(nextLayout, targetPaneId, (pane) => ({
          ...pane,
          tabIds: [...pane.tabIds, ...missingTabIds],
          activeTabId:
            pane.activeTabId && pane.tabIds.includes(pane.activeTabId)
              ? pane.activeTabId
              : (missingTabIds.at(-1) ?? pane.tabIds[0] ?? null),
        })) ?? nextLayout;
    }
  }

  if (activeTabId) {
    const pane = findPaneContainingTab(nextLayout, activeTabId);
    if (pane) {
      nextLayout =
        updatePane(nextLayout, pane.id, (currentPane) => ({
          ...currentPane,
          activeTabId,
        })) ?? nextLayout;
    }
  }

  return nextLayout;
}

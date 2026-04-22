"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from "react";

import { useUserSettings } from "@/hooks/use-user-settings";
import type { FileType } from "@/data/modules/notebook/client-types";

import {
  createPane,
  findPane,
  findPaneContainingTab,
  getEdgePaneId,
  getFirstPaneId,
  getNextActiveTabId,
  getPaneIds,
  insertTabAt,
  normalizeLayout,
  removeTabFromLayout,
  replacePaneWithSplit,
  syncLayoutWithTabs,
  updatePane,
} from "./layout-operations";
import { getPreviewRect, resolveHoverTarget } from "./drag-geometry";
import type {
  DropSide,
  HeaderDragState,
  HeaderTab,
  HoverTarget,
  PreviewRect,
  WorkspaceDragState,
  WorkspaceHandle,
  WorkspaceLayout,
  WorkspaceTab,
  WorkspaceTabMeta,
} from "./types";

/**
 * Shape of the single workspace context that backs both the
 * {@link useWorkspace} and {@link useTabs} hooks. Values are split into
 * logical sections (workspace state, pane plumbing, tab operations) so
 * the two hooks can expose different slices of the same underlying
 * provider.
 */
type WorkspaceContextValue = {
  // ---- Workspace-level state -----------------------------------------
  tabs: WorkspaceTab<unknown>[];
  tabsById: Map<string, WorkspaceTab<unknown>>;
  layout: WorkspaceLayout;
  focusedPaneId: string | null;
  dragState: WorkspaceDragState | null;
  hoverTarget: HoverTarget | null;
  previewRect: PreviewRect | null;
  toggleButtonPaneId: string | null;
  sidebarPosition: "left" | "right";
  emptyState: ReactNode;
  rootRef: MutableRefObject<HTMLDivElement | null>;

  // ---- Pane plumbing (refs, focus, splits) ---------------------------
  setPaneRef: (paneId: string, node: HTMLDivElement | null) => void;
  setHeaderRef: (paneId: string, node: HTMLDivElement | null) => void;
  focusPane: (paneId: string) => void;
  openInSplit: (tabId: string, side?: Exclude<DropSide, "center">) => void;

  // ---- Tab operations (scoped by pane id) ----------------------------
  getPaneTabs: (paneId: string) => WorkspaceTab<unknown>[];
  getRenderedPaneTabs: (paneId: string) => WorkspaceTab<unknown>[];
  getPaneActiveTabId: (paneId: string) => string | null;
  selectTab: (paneId: string, tabId: string) => void;
  closeTab: (paneId: string, tabId: string) => void;
  reorderTabs: (paneId: string, nextTabIds: string[]) => void;
  handleHeaderDragStateChange: (
    paneId: string,
    state: HeaderDragState | null,
  ) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function useWorkspaceContext() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error(
      "Workspace hooks must be used inside <WorkspaceProvider> (rendered by <Workspace>).",
    );
  }
  return value;
}

/** Props accepted by the provider. Mirrors {@link WorkspaceProps} minus UI. */
export type WorkspaceProviderProps<TMeta> = {
  tabs: WorkspaceTab<TMeta>[];
  activeTabId?: string;
  defaultActiveTabId?: string;
  initialLayout?: WorkspaceLayout | null;
  emptyState?: ReactNode;
  handleRef?: MutableRefObject<WorkspaceHandle | null>;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string, nextActiveTabId: string | null) => void;
  onLayoutChange?: (layout: WorkspaceLayout | null) => void;
  children: ReactNode;
};

/**
 * Workspace provider: owns the full state machine for panes, tab
 * placement, drag-and-drop, focus and preview overlays. Composed by the
 * public {@link Workspace} component.
 */
export function WorkspaceProvider<TMeta>({
  tabs,
  activeTabId,
  defaultActiveTabId,
  initialLayout,
  emptyState,
  handleRef,
  onTabSelect,
  onTabClose,
  onLayoutChange,
  children,
}: WorkspaceProviderProps<TMeta>) {
  const { settings } = useUserSettings();
  const sidebarPosition = settings.appearance?.sidebarPosition ?? "left";
  const controlledActiveTabId = activeTabId ?? defaultActiveTabId ?? null;

  // --------------------------------------------------------------------
  // Core state + refs
  // --------------------------------------------------------------------
  const tabsList = tabs as WorkspaceTab<unknown>[];
  const tabsById = useMemo(
    () => new Map(tabsList.map((tab) => [tab.id, tab])),
    [tabsList],
  );

  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [dragState, setDragState] = useState<WorkspaceDragState | null>(null);
  const [previewRect, setPreviewRect] = useState<PreviewRect | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);

  // Refs avoid stale-closure reads inside pointer callbacks.
  const latestLayoutRef = useRef<WorkspaceLayout | null>(null);
  const dragStateRef = useRef<WorkspaceDragState | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    syncLayoutWithTabs(
      initialLayout ?? null,
      tabsList.map((tab) => tab.id),
      controlledActiveTabId ?? undefined,
      null,
    ),
  );

  const toggleButtonPaneId = getEdgePaneId(layout, sidebarPosition);

  // --------------------------------------------------------------------
  // State synchronization effects
  // --------------------------------------------------------------------
  useEffect(() => {
    setLayout((currentLayout) =>
      syncLayoutWithTabs(
        currentLayout,
        tabsList.map((tab) => tab.id),
        controlledActiveTabId ?? undefined,
        focusedPaneId,
      ),
    );
  }, [controlledActiveTabId, focusedPaneId, tabsList]);

  useEffect(() => {
    latestLayoutRef.current = layout;
    onLayoutChange?.(normalizeLayout(layout));
  }, [layout, onLayoutChange]);

  useEffect(() => {
    hoverTargetRef.current = hoverTarget;
  }, [hoverTarget]);

  useEffect(() => {
    if (!layout) return;
    const paneIds = getPaneIds(layout);
    if (paneIds.length === 0) {
      setFocusedPaneId(null);
      return;
    }
    if (!focusedPaneId || !paneIds.includes(focusedPaneId)) {
      setFocusedPaneId(paneIds[0] ?? null);
    }
  }, [focusedPaneId, layout]);

  // --------------------------------------------------------------------
  // Pane plumbing
  // --------------------------------------------------------------------
  const setPaneRef = useCallback(
    (paneId: string, node: HTMLDivElement | null) => {
      paneRefs.current[paneId] = node;
    },
    [],
  );

  const setHeaderRef = useCallback(
    (paneId: string, node: HTMLDivElement | null) => {
      headerRefs.current[paneId] = node;
    },
    [],
  );

  const focusPane = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
  }, []);

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
    setHoverTarget(null);
    setPreviewRect(null);
  }, []);

  // --------------------------------------------------------------------
  // Tab operations
  // --------------------------------------------------------------------
  const selectTab = useCallback(
    (paneId: string, tabId: string) => {
      setFocusedPaneId(paneId);
      setLayout(
        (currentLayout) =>
          (updatePane(currentLayout, paneId, (pane) => ({
            ...pane,
            activeTabId: tabId,
          })) ?? currentLayout) as WorkspaceLayout,
      );
      onTabSelect?.(tabId);
    },
    [onTabSelect],
  );

  const closeTab = useCallback(
    (paneId: string, tabId: string) => {
      const nextActiveTabId = getNextActiveTabId(layout, tabId, paneId);
      onTabClose?.(tabId, nextActiveTabId);
    },
    [layout, onTabClose],
  );

  const reorderTabs = useCallback((paneId: string, nextTabIds: string[]) => {
    setLayout((currentLayout) => {
      const pane = findPane(currentLayout, paneId);
      if (!pane || pane.tabIds.length !== nextTabIds.length) {
        return currentLayout as WorkspaceLayout;
      }
      const currentIdSet = new Set(pane.tabIds);
      if (nextTabIds.some((tabId) => !currentIdSet.has(tabId))) {
        return currentLayout as WorkspaceLayout;
      }
      return (updatePane(currentLayout, paneId, (currentPane) => ({
        ...currentPane,
        tabIds: nextTabIds,
      })) ?? currentLayout) as WorkspaceLayout;
    });
  }, []);

  // --------------------------------------------------------------------
  // Drag + drop commit
  // --------------------------------------------------------------------
  const commitDrop = useCallback(
    (target: HoverTarget, drag: WorkspaceDragState) => {
      const currentLayout = latestLayoutRef.current;
      if (!currentLayout) return;

      const sourcePane = findPane(currentLayout, drag.sourcePaneId);
      if (!sourcePane) {
        clearDragState();
        return;
      }

      // No-op when dragging the only tab of a pane onto that same pane's
      // edge — it would just recreate the same layout.
      if (
        target.side !== "center" &&
        drag.sourcePaneId === target.paneId &&
        sourcePane.tabIds.length <= 1
      ) {
        clearDragState();
        return;
      }

      let nextLayout = removeTabFromLayout(currentLayout, drag.tabId);
      nextLayout = normalizeLayout(nextLayout);
      if (!nextLayout) nextLayout = createPane();

      if (target.side === "center") {
        nextLayout =
          updatePane(nextLayout, target.paneId, (pane) => ({
            ...pane,
            tabIds: insertTabAt(pane.tabIds, drag.tabId, target.index),
            activeTabId: drag.tabId,
          })) ?? nextLayout;
      } else {
        const newPane = createPane([drag.tabId], drag.tabId);
        nextLayout = replacePaneWithSplit(
          nextLayout,
          target.paneId,
          target.side,
          newPane,
        );
      }

      const normalizedLayout = syncLayoutWithTabs(
        normalizeLayout(nextLayout),
        tabsList.map((tab) => tab.id),
        drag.tabId,
        target.paneId,
      );

      setLayout(normalizedLayout);
      setFocusedPaneId(
        target.side === "center"
          ? target.paneId
          : (findPaneContainingTab(normalizedLayout, drag.tabId)?.id ??
              target.paneId),
      );
      onTabSelect?.(drag.tabId);
      clearDragState();
    },
    [clearDragState, onTabSelect, tabsList],
  );

  const handleHeaderDragStateChange = useCallback(
    (paneId: string, nextDragState: HeaderDragState | null) => {
      if (!nextDragState) {
        // Drag end: commit drop if we have one, otherwise just clear.
        const finalDragState = dragStateRef.current;
        const finalHoverTarget = hoverTargetRef.current;
        if (
          finalDragState?.hasMoved &&
          finalDragState.isOutsideHeader &&
          finalHoverTarget
        ) {
          commitDrop(finalHoverTarget, finalDragState);
          return;
        }
        clearDragState();
        return;
      }

      const workspaceDragState: WorkspaceDragState = {
        ...nextDragState,
        sourcePaneId: paneId,
      };

      dragStateRef.current = workspaceDragState;
      setDragState(workspaceDragState);
      setFocusedPaneId(paneId);

      const nextHoverTarget = resolveHoverTarget(
        latestLayoutRef.current,
        paneRefs.current,
        headerRefs.current,
        workspaceDragState,
      );
      setHoverTarget(nextHoverTarget);
    },
    [clearDragState, commitDrop],
  );

  useLayoutEffect(() => {
    setPreviewRect(
      getPreviewRect(
        rootRef.current,
        hoverTarget ? paneRefs.current[hoverTarget.paneId] : null,
        hoverTarget,
      ),
    );
  }, [hoverTarget]);

  // --------------------------------------------------------------------
  // Imperative split API exposed through handleRef
  // --------------------------------------------------------------------
  const replaceTab = useCallback((oldTabId: string, newTabId: string) => {
    if (oldTabId === newTabId) return;

    setLayout((currentLayout) => {
      const owningPane = findPaneContainingTab(currentLayout, oldTabId);
      if (!owningPane) return currentLayout;

      const layoutWithoutNewTab = (removeTabFromLayout(
        currentLayout,
        newTabId,
      ) ?? currentLayout) as WorkspaceLayout;

      const targetPane = findPaneContainingTab(layoutWithoutNewTab, oldTabId);
      if (!targetPane) return currentLayout;

      const index = targetPane.tabIds.indexOf(oldTabId);
      if (index === -1) return currentLayout;

      const nextTabIds = [...targetPane.tabIds];
      nextTabIds.splice(index, 1, newTabId);

      return (updatePane(layoutWithoutNewTab, targetPane.id, (pane) => ({
        ...pane,
        tabIds: nextTabIds,
        activeTabId: newTabId,
      })) ?? layoutWithoutNewTab) as WorkspaceLayout;
    });
  }, []);

  const openInSplit = useCallback(
    (tabId: string, side: Exclude<DropSide, "center"> = "right") => {
      setLayout((currentLayout) => {
        const hintPaneId =
          focusedPaneId && findPane(currentLayout, focusedPaneId)
            ? focusedPaneId
            : getFirstPaneId(currentLayout);

        const stripped = normalizeLayout(
          removeTabFromLayout(currentLayout, tabId),
        );
        const base = stripped ?? createPane();

        const targetPaneId =
          hintPaneId && findPane(base, hintPaneId)
            ? hintPaneId
            : getFirstPaneId(base);
        if (!targetPaneId) return createPane([tabId], tabId);

        const newPane = createPane([tabId], tabId);
        const nextLayout = replacePaneWithSplit(
          base,
          targetPaneId,
          side,
          newPane,
        );
        return (normalizeLayout(nextLayout) ??
          currentLayout) as WorkspaceLayout;
      });
    },
    [focusedPaneId],
  );

  useEffect(() => {
    if (!handleRef) return;
    handleRef.current = { openInSplit, replaceTab };
    return () => {
      handleRef.current = null;
    };
  }, [handleRef, openInSplit, replaceTab]);

  // --------------------------------------------------------------------
  // Pane → tab derivations
  // --------------------------------------------------------------------
  const getPaneTabs = useCallback(
    (paneId: string) => {
      const pane = findPane(layout, paneId);
      if (!pane) return [];
      return pane.tabIds
        .map((tabId) => tabsById.get(tabId))
        .filter((tab): tab is WorkspaceTab<unknown> => Boolean(tab));
    },
    [layout, tabsById],
  );

  const getPaneActiveTabId = useCallback(
    (paneId: string) => findPane(layout, paneId)?.activeTabId ?? null,
    [layout],
  );

  // While a cross-pane drag is over this pane's header, inject a preview
  // copy of the dragged tab at the hover index. The source pane is left
  // alone so it doesn't reflow on every pointer tick.
  const getRenderedPaneTabs = useCallback(
    (paneId: string) => {
      const baseTabs = getPaneTabs(paneId);
      if (
        !dragState?.hasMoved ||
        !dragState.isOutsideHeader ||
        hoverTarget?.paneId !== paneId ||
        hoverTarget.side !== "center" ||
        hoverTarget.index === undefined ||
        paneId === dragState.sourcePaneId
      ) {
        return baseTabs;
      }

      const draggedTab = tabsById.get(dragState.tabId);
      if (!draggedTab) return baseTabs;

      const nextIds = insertTabAt(
        baseTabs.map((tab) => tab.id),
        dragState.tabId,
        hoverTarget.index,
      );
      return nextIds
        .map((tabId) =>
          tabId === dragState.tabId
            ? draggedTab
            : baseTabs.find((tab) => tab.id === tabId),
        )
        .filter((tab): tab is WorkspaceTab<unknown> => Boolean(tab));
    },
    [dragState, getPaneTabs, hoverTarget, tabsById],
  );

  const value: WorkspaceContextValue = {
    tabs: tabsList,
    tabsById,
    layout,
    focusedPaneId,
    dragState,
    hoverTarget,
    previewRect,
    toggleButtonPaneId,
    sidebarPosition,
    emptyState,
    rootRef,
    setPaneRef,
    setHeaderRef,
    focusPane,
    openInSplit,
    getPaneTabs,
    getRenderedPaneTabs,
    getPaneActiveTabId,
    selectTab,
    closeTab,
    reorderTabs,
    handleHeaderDragStateChange,
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * `useWorkspace` exposes the layout-level slice of the workspace context
 * — panes, splits, focus, drag preview, and the imperative `openInSplit`
 * helper. Components rendering panes/splits and root overlays use this.
 */
export function useWorkspace() {
  const ctx = useWorkspaceContext();
  return {
    layout: ctx.layout,
    focusedPaneId: ctx.focusedPaneId,
    dragState: ctx.dragState,
    hoverTarget: ctx.hoverTarget,
    previewRect: ctx.previewRect,
    toggleButtonPaneId: ctx.toggleButtonPaneId,
    sidebarPosition: ctx.sidebarPosition,
    tabsById: ctx.tabsById,
    emptyState: ctx.emptyState,
    rootRef: ctx.rootRef,
    setPaneRef: ctx.setPaneRef,
    setHeaderRef: ctx.setHeaderRef,
    focusPane: ctx.focusPane,
    openInSplit: ctx.openInSplit,
  };
}

/**
 * `useTabs` exposes the tab-level slice of the workspace context. All
 * operations are pane-scoped — the caller is expected to pass the
 * `paneId` they belong to (matching the pane currently rendering them).
 */
export function useTabs() {
  const ctx = useWorkspaceContext();
  return {
    tabsById: ctx.tabsById,
    dragState: ctx.dragState,
    getPaneTabs: ctx.getPaneTabs,
    getRenderedPaneTabs: ctx.getRenderedPaneTabs,
    getPaneActiveTabId: ctx.getPaneActiveTabId,
    selectTab: ctx.selectTab,
    closeTab: ctx.closeTab,
    reorderTabs: ctx.reorderTabs,
    onHeaderDragStateChange: ctx.handleHeaderDragStateChange,
  };
}

/**
 * Derive the shape consumed by the TabHeader row from a pane's tab list
 * and its active-tab id. Kept here (alongside the context) because it
 * glues WorkspaceTab metadata to the header's simpler type.
 */
export function getHeaderTabs<TMeta>(
  paneTabs: WorkspaceTab<TMeta>[],
  activeTabId: string | null,
): HeaderTab[] {
  return paneTabs.map((tab) => ({
    id: tab.id,
    name: tab.title,
    type: ((tab.meta as WorkspaceTabMeta | undefined)?.type ??
      "file") as FileType,
    isActive: tab.id === activeTabId,
  }));
}

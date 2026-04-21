"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { AnimatePresence, motion } from "motion/react";
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from "react-resizable-panels";

import type { TabsViewTab } from "@/components/tabs";
import Header from "@/components/tabs/header";
import type { HeaderDragState } from "@/components/tabs/header-types";
import type { FileType } from "@/data/modules/notebook/client-types";
import { cn } from "@/lib/utils";

type SplitDirection = "horizontal" | "vertical";
type DropSide = "center" | "left" | "right" | "top" | "bottom";

type WorkspacePaneNode = {
  id: string;
  type: "pane";
  tabIds: string[];
  activeTabId: string | null;
};

type WorkspaceSplitNode = {
  id: string;
  type: "split";
  direction: SplitDirection;
  size: number;
  first: WorkspaceLayout;
  second: WorkspaceLayout;
};

export type WorkspaceLayout = WorkspacePaneNode | WorkspaceSplitNode;

type WorkspaceTabMeta = {
  type?: FileType;
};

type WorkspaceDragState = HeaderDragState & {
  sourcePaneId: string;
};

type HoverTarget = {
  paneId: string;
  side: DropSide;
  index?: number;
};

type WorkspaceProps<TMeta = unknown> = {
  tabs: TabsViewTab<TMeta>[];
  activeTabId?: string;
  defaultActiveTabId?: string;
  initialLayout?: WorkspaceLayout | null;
  emptyState?: ReactNode;
  className?: string;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string, nextActiveTabId: string | null) => void;
  onLayoutChange?: (layout: WorkspaceLayout | null) => void;
};

type PreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const DEFAULT_SPLIT_SIZE = 50;
const EDGE_TARGET_RATIO = 0.26;

function createPane(
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

function getPaneIds(layout: WorkspaceLayout | null): string[] {
  if (!layout) return [];
  if (layout.type === "pane") return [layout.id];

  return [...getPaneIds(layout.first), ...getPaneIds(layout.second)];
}

function findPane(
  layout: WorkspaceLayout | null,
  paneId: string,
): WorkspacePaneNode | null {
  if (!layout) return null;
  if (layout.type === "pane") return layout.id === paneId ? layout : null;

  return findPane(layout.first, paneId) ?? findPane(layout.second, paneId);
}

function findPaneContainingTab(
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

function collectAssignedTabIds(layout: WorkspaceLayout | null): string[] {
  if (!layout) return [];
  if (layout.type === "pane") return layout.tabIds;

  return [
    ...collectAssignedTabIds(layout.first),
    ...collectAssignedTabIds(layout.second),
  ];
}

function updatePane(
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

function normalizeLayout(
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

  return {
    ...layout,
    first,
    second,
  };
}

function insertTabAt(tabIds: string[], tabId: string, index?: number) {
  const nextTabIds = tabIds.filter((currentTabId) => currentTabId !== tabId);
  const clampedIndex =
    index === undefined
      ? nextTabIds.length
      : Math.max(0, Math.min(index, nextTabIds.length));

  nextTabIds.splice(clampedIndex, 0, tabId);
  return nextTabIds;
}

function removeTabFromLayout(
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

function replacePaneWithSplit(
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

function getFirstPaneId(layout: WorkspaceLayout | null): string | null {
  return getPaneIds(layout)[0] ?? null;
}

function getNextActiveTabId(
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

function syncLayoutWithTabs(
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

function pruneUnavailableTabs(
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

function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function getHeaderInsertIndex(
  headerNode: HTMLDivElement | null,
  pointerX: number,
) {
  if (!headerNode) return 0;

  const tabElements = Array.from(
    headerNode.querySelectorAll<HTMLElement>("[data-tab-id]"),
  );

  if (tabElements.length === 0) return 0;

  let nextIndex = 0;

  for (const tabElement of tabElements) {
    const rect = tabElement.getBoundingClientRect();
    if (pointerX > rect.left + rect.width / 2) nextIndex += 1;
  }

  return nextIndex;
}

function getPaneHoverTarget(
  paneRect: DOMRect,
  headerRect: DOMRect | null,
  pointerX: number,
  pointerY: number,
): DropSide | null {
  if (!pointInsideRect(pointerX, pointerY, paneRect)) return null;

  if (headerRect && pointInsideRect(pointerX, pointerY, headerRect)) {
    return "center";
  }

  const leftDistance = pointerX - paneRect.left;
  const rightDistance = paneRect.right - pointerX;
  const topDistance = pointerY - paneRect.top;
  const bottomDistance = paneRect.bottom - pointerY;
  const edgeThresholdX = paneRect.width * EDGE_TARGET_RATIO;
  const edgeThresholdY = paneRect.height * EDGE_TARGET_RATIO;
  const edgeCandidates: Array<{
    side: Exclude<DropSide, "center">;
    distance: number;
  }> = [
    { side: "left", distance: leftDistance },
    { side: "right", distance: rightDistance },
    { side: "top", distance: topDistance },
    { side: "bottom", distance: bottomDistance },
  ];

  const closestEdge = edgeCandidates.sort(
    (first, second) => first.distance - second.distance,
  )[0];

  if (!closestEdge) return null;

  if (
    (closestEdge.side === "left" || closestEdge.side === "right") &&
    closestEdge.distance <= edgeThresholdX
  ) {
    return closestEdge.side;
  }

  if (
    (closestEdge.side === "top" || closestEdge.side === "bottom") &&
    closestEdge.distance <= edgeThresholdY
  ) {
    return closestEdge.side;
  }

  return "center";
}

function resolveHoverTarget(
  layout: WorkspaceLayout | null,
  paneRefs: Record<string, HTMLDivElement | null>,
  headerRefs: Record<string, HTMLDivElement | null>,
  dragState: WorkspaceDragState | null,
): HoverTarget | null {
  if (!layout || !dragState?.hasMoved || !dragState.isOutsideHeader)
    return null;

  for (const paneId of getPaneIds(layout)) {
    const paneRect = paneRefs[paneId]?.getBoundingClientRect();
    if (!paneRect) continue;

    const headerNode = headerRefs[paneId];
    const headerRect = headerNode?.getBoundingClientRect() ?? null;
    const side = getPaneHoverTarget(
      paneRect,
      headerRect,
      dragState.pointerX,
      dragState.pointerY,
    );

    if (!side) continue;
    const isInsideHeader = headerRect
      ? pointInsideRect(dragState.pointerX, dragState.pointerY, headerRect)
      : false;

    return {
      paneId,
      side,
      index:
        side === "center" && isInsideHeader
          ? getHeaderInsertIndex(headerNode, dragState.pointerX)
          : undefined,
    };
  }

  return null;
}

function getHeaderTabs<TMeta>(
  paneTabs: TabsViewTab<TMeta>[],
  activeTabId: string | null,
) {
  return paneTabs.map((tab) => ({
    id: tab.id,
    name: tab.title,
    type: ((tab.meta as WorkspaceTabMeta | undefined)?.type ??
      "file") as FileType,
    isActive: tab.id === activeTabId,
  }));
}

// Inserts a live preview of the dragged tab into the hovered target pane so it
// slides into place like a reorder. The source pane is left alone to avoid
// reflow churn on every pointer tick.
function getRenderedPaneTabs<TMeta>(
  paneId: string,
  paneTabs: TabsViewTab<TMeta>[],
  tabsById: Map<string, TabsViewTab<TMeta>>,
  dragState: WorkspaceDragState | null,
  hoverTarget: HoverTarget | null,
) {
  if (
    !dragState?.hasMoved ||
    !dragState.isOutsideHeader ||
    hoverTarget?.paneId !== paneId ||
    hoverTarget.side !== "center" ||
    hoverTarget.index === undefined ||
    paneId === dragState.sourcePaneId
  )
    return paneTabs;

  const draggedTab = tabsById.get(dragState.tabId);
  if (!draggedTab) return paneTabs;

  const nextIds = insertTabAt(
    paneTabs.map((tab) => tab.id),
    dragState.tabId,
    hoverTarget.index,
  );

  return nextIds
    .map((tabId) =>
      tabId === dragState.tabId
        ? draggedTab
        : paneTabs.find((tab) => tab.id === tabId),
    )
    .filter((tab): tab is TabsViewTab<TMeta> => Boolean(tab));
}

function WorkspaceResizeHandle(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <ResizableHandle
      {...props}
      className={cn(
        "relative flex w-px items-center justify-center bg-border/70 hover:bg-sidebar-border/70",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0",
        "aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        props.className,
      )}
    ></ResizableHandle>
  );
}

function getPreviewRect(
  rootNode: HTMLDivElement | null,
  paneNode: HTMLDivElement | null,
  _headerNode: HTMLDivElement | null,
  hoverTarget: HoverTarget | null,
  _dragState: WorkspaceDragState | null,
): PreviewRect | null {
  if (!rootNode || !paneNode || !hoverTarget) return null;

  const rootRect = rootNode.getBoundingClientRect();
  const paneRect = paneNode.getBoundingClientRect();
  const inset = 8;

  if (hoverTarget.side === "center") {
    if (hoverTarget.index !== undefined) return null;
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width - inset * 2),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "left") {
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width / 2 - inset * 1.5),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "right") {
    return {
      x: paneRect.left - rootRect.left + paneRect.width / 2,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width / 2 - inset * 1.5),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "top") {
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width - inset * 2),
      height: Math.max(80, paneRect.height / 2 - inset * 1.5),
    };
  }

  return {
    x: paneRect.left - rootRect.left + inset,
    y: paneRect.top - rootRect.top + paneRect.height / 2,
    width: Math.max(80, paneRect.width - inset * 2),
    height: Math.max(80, paneRect.height / 2 - inset * 1.5),
  };
}

function renderLayoutTree<TMeta>({
  layout,
  tabsById,
  dragState,
  hoverTarget,
  focusedPaneId,
  setPaneRef,
  setHeaderRef,
  onPaneFocus,
  onTabSelect,
  onTabClose,
  onTabReorder,
  onHeaderDragStateChange,
}: {
  layout: WorkspaceLayout;
  tabsById: Map<string, TabsViewTab<TMeta>>;
  dragState: WorkspaceDragState | null;
  hoverTarget: HoverTarget | null;
  focusedPaneId: string | null;
  setPaneRef: (paneId: string, node: HTMLDivElement | null) => void;
  setHeaderRef: (paneId: string, node: HTMLDivElement | null) => void;
  onPaneFocus: (paneId: string) => void;
  onTabSelect: (paneId: string, tabId: string) => void;
  onTabClose: (paneId: string, tabId: string) => void;
  onTabReorder: (paneId: string, nextTabIds: string[]) => void;
  onHeaderDragStateChange: (
    paneId: string,
    nextDragState: HeaderDragState | null,
  ) => void;
}): ReactNode {
  if (layout.type === "split") {
    return (
      <ResizablePanelGroup
        orientation={layout.direction}
        className="h-full w-full"
      >
        <ResizablePanel defaultSize={layout.size} minSize={24}>
          {renderLayoutTree({
            layout: layout.first,
            tabsById,
            dragState,
            hoverTarget,
            focusedPaneId,
            setPaneRef,
            setHeaderRef,
            onPaneFocus,
            onTabSelect,
            onTabClose,
            onTabReorder,
            onHeaderDragStateChange,
          })}
        </ResizablePanel>

        <WorkspaceResizeHandle />

        <ResizablePanel defaultSize={100 - layout.size} minSize={24}>
          {renderLayoutTree({
            layout: layout.second,
            tabsById,
            dragState,
            hoverTarget,
            focusedPaneId,
            setPaneRef,
            setHeaderRef,
            onPaneFocus,
            onTabSelect,
            onTabClose,
            onTabReorder,
            onHeaderDragStateChange,
          })}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  const basePaneTabs = layout.tabIds
    .map((tabId) => tabsById.get(tabId))
    .filter((tab): tab is TabsViewTab<TMeta> => Boolean(tab));
  const paneTabs = getRenderedPaneTabs(
    layout.id,
    basePaneTabs,
    tabsById,
    dragState,
    hoverTarget,
  );
  const activeTab =
    paneTabs.find((tab) => tab.id === layout.activeTabId) ??
    paneTabs[0] ??
    null;

  return (
    <div
      ref={(node) => setPaneRef(layout.id, node)}
      className={cn(
        "group/pane relative flex h-full min-h-0 flex-col overflow-hidden",
        focusedPaneId === layout.id && "ring-1 ring-primary/25",
      )}
      onMouseDown={() => onPaneFocus(layout.id)}
    >
      <div ref={(node) => setHeaderRef(layout.id, node)} className="relative">
        <Header
          placeholder={false}
          showSidebarToggle={false}
          tabs={getHeaderTabs(paneTabs, activeTab?.id ?? null)}
          onTabSelect={(tabId) => onTabSelect(layout.id, tabId)}
          onTabClose={(tabId) => onTabClose(layout.id, tabId)}
          onTabReorder={(nextTabIds) => onTabReorder(layout.id, nextTabIds)}
          onTabDragStateChange={(nextDragState) =>
            onHeaderDragStateChange(layout.id, nextDragState)
          }
        />
      </div>

      <div className="relative min-h-0 flex-1 bg-background/95">
        {activeTab ? (
          <div
            className="h-full"
            onMouseDown={() => {
              onPaneFocus(layout.id);
              onTabSelect(layout.id, activeTab.id);
            }}
          >
            {activeTab.content}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function Workspace<TMeta = unknown>({
  tabs,
  activeTabId,
  defaultActiveTabId,
  initialLayout,
  emptyState,
  className,
  onTabSelect,
  onTabClose,
  onLayoutChange,
}: WorkspaceProps<TMeta>) {
  const controlledActiveTabId = activeTabId ?? defaultActiveTabId ?? null;
  const tabsById = useMemo(
    () => new Map(tabs.map((tab) => [tab.id, tab])),
    [tabs],
  );
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [dragState, setDragState] = useState<WorkspaceDragState | null>(null);
  const [previewRect, setPreviewRect] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const [focusedPaneId, setFocusedPaneId] = useState<string | null>(null);
  const latestLayoutRef = useRef<WorkspaceLayout | null>(null);
  const dragStateRef = useRef<WorkspaceDragState | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const headerRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [layout, setLayout] = useState<WorkspaceLayout>(() =>
    syncLayoutWithTabs(
      initialLayout ?? null,
      tabs.map((tab) => tab.id),
      controlledActiveTabId ?? undefined,
      null,
    ),
  );

  useEffect(() => {
    setLayout((currentLayout) =>
      syncLayoutWithTabs(
        currentLayout,
        tabs.map((tab) => tab.id),
        controlledActiveTabId ?? undefined,
        focusedPaneId,
      ),
    );
  }, [controlledActiveTabId, focusedPaneId, tabs]);

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

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
    setHoverTarget(null);
    setPreviewRect(null);
  }, []);

  const handlePaneFocus = useCallback((paneId: string) => {
    setFocusedPaneId(paneId);
  }, []);

  const handleTabSelect = useCallback(
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

  const commitDrop = useCallback(
    (target: HoverTarget, dragState: WorkspaceDragState) => {
      const currentLayout = latestLayoutRef.current;
      if (!currentLayout) return;

      const sourcePane = findPane(currentLayout, dragState.sourcePaneId);
      if (!sourcePane) {
        clearDragState();
        return;
      }

      if (
        target.side !== "center" &&
        dragState.sourcePaneId === target.paneId &&
        sourcePane.tabIds.length <= 1
      ) {
        clearDragState();
        return;
      }

      let nextLayout = removeTabFromLayout(currentLayout, dragState.tabId);
      nextLayout = normalizeLayout(nextLayout);

      if (!nextLayout) nextLayout = createPane();

      if (target.side === "center") {
        nextLayout =
          updatePane(nextLayout, target.paneId, (pane) => ({
            ...pane,
            tabIds: insertTabAt(pane.tabIds, dragState.tabId, target.index),
            activeTabId: dragState.tabId,
          })) ?? nextLayout;
      } else {
        const nextPane = createPane([dragState.tabId], dragState.tabId);
        nextLayout = replacePaneWithSplit(
          nextLayout,
          target.paneId,
          target.side,
          nextPane,
        );
      }

      const normalizedLayout = syncLayoutWithTabs(
        normalizeLayout(nextLayout),
        tabs.map((tab) => tab.id),
        dragState.tabId,
        target.paneId,
      );

      setLayout(normalizedLayout);
      setFocusedPaneId(
        target.side === "center"
          ? target.paneId
          : (findPaneContainingTab(normalizedLayout, dragState.tabId)?.id ??
              target.paneId),
      );
      onTabSelect?.(dragState.tabId);
      clearDragState();
    },
    [clearDragState, onTabSelect, tabs],
  );

  const handlePaneTabReorder = useCallback(
    (paneId: string, nextTabIds: string[]) => {
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
    },
    [],
  );

  const handleHeaderDragStateChange = useCallback(
    (paneId: string, nextDragState: HeaderDragState | null) => {
      if (!nextDragState) {
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
        hoverTarget ? headerRefs.current[hoverTarget.paneId] : null,
        hoverTarget,
        dragState,
      ),
    );
  }, [dragState, hoverTarget]);

  const handleTabClose = useCallback(
    (paneId: string, tabId: string) => {
      const nextActiveTabId = getNextActiveTabId(layout, tabId, paneId);
      onTabClose?.(tabId, nextActiveTabId);
    },
    [layout, onTabClose],
  );

  if (tabs.length === 0) {
    return (
      <div className={cn("h-full w-full", className)}>{emptyState ?? null}</div>
    );
  }

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full w-full min-h-0", className)}
    >
      {layout
        ? renderLayoutTree({
            layout,
            tabsById,
            dragState,
            hoverTarget,
            focusedPaneId,
            setPaneRef,
            setHeaderRef,
            onPaneFocus: handlePaneFocus,
            onTabSelect: handleTabSelect,
            onTabClose: handleTabClose,
            onTabReorder: handlePaneTabReorder,
            onHeaderDragStateChange: handleHeaderDragStateChange,
          })
        : null}

      <AnimatePresence>
        {previewRect ? (
          <motion.div
            key="workspace-preview"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: previewRect.x,
              y: previewRect.y,
              width: previewRect.width,
              height: previewRect.height,
            }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-primary/45 bg-primary/12 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {dragState?.hasMoved && dragState.isOutsideHeader ? (
          <div
            key={dragState.tabId}
            className="pointer-events-none absolute left-0 top-0 z-40 overflow-hidden rounded-t-lg border border-sidebar-border bg-background/95 shadow-lg"
            style={{
              width: dragState.tabWidth,
              height: dragState.tabHeight,
              transform: `translate3d(${
                dragState.pointerX -
                (rootRef.current?.getBoundingClientRect().left ?? 0) -
                dragState.pointerOffsetX
              }px, ${
                dragState.pointerY -
                (rootRef.current?.getBoundingClientRect().top ?? 0) -
                dragState.pointerOffsetY
              }px, 0)`,
            }}
          >
            <div className="flex h-full items-center px-3 text-sm font-medium text-foreground">
              <span className="truncate">
                {tabsById.get(dragState.tabId)?.title ?? "Moving tab"}
              </span>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

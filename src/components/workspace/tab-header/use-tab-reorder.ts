import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { HeaderDragState, HeaderPointerState, HeaderTab } from "../types";
import { areOrdersEqual, moveTab } from "./utils";

/**
 * Hook that owns interactive tab-reordering behavior inside a TabHeader.
 *
 * Process overview:
 * 1. Keep a visual order that can diverge from the incoming `tabs` while
 *    a drag is in progress.
 * 2. Track pointer state to compute drag distance and swap decisions.
 * 3. Animate sibling tabs when order changes (FLIP-style).
 * 4. Commit the reorder only after drag ends and the order changed.
 *
 * Constraints:
 * - Pointer down still selects the tab immediately.
 * - Avoid reorders from tiny pointer jitter (swap threshold).
 * - Keep DOM reads/writes stable enough for smooth dragging.
 */
type UseTabReorderParams = {
  tabs: HeaderTab[];
  onTabReorder?: (tabIds: string[]) => void;
  onTabDragStateChange?: (state: HeaderDragState | null) => void;
};

type UseTabReorderResult = {
  canReorder: boolean;
  orderedTabs: HeaderTab[];
  slidingTabId: string | null;
  draggingTabId: string | null;
  slideOffsetX: number;
  setContainerRef: (node: HTMLDivElement | null) => void;
  setTabRef: (tabId: string, node: HTMLDivElement | null) => void;
  handleTabClick: (
    event: MouseEvent<HTMLDivElement>,
    tabId: string,
    onTabSelect: (tabId: string) => void,
  ) => void;
  handlePointerDown: (
    tabId: string,
    event: ReactPointerEvent<HTMLDivElement>,
    onTabSelect: (tabId: string) => void,
  ) => void;
};

export function useTabReorder({
  tabs,
  onTabReorder,
  onTabDragStateChange,
}: UseTabReorderParams): UseTabReorderResult {
  // Drag visual state only. Source-of-truth order remains external until
  // reorder is committed via `onTabReorder`.
  const [slidingTabId, setSlidingTabId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [slideOffsetX, setSlideOffsetX] = useState(0);
  const [visualTabOrder, setVisualTabOrder] = useState<string[]>([]);

  // Refs for high-frequency pointer operations (avoid extra renders).
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const orderRef = useRef<string[]>([]);
  const tabLeftByIdRef = useRef<Record<string, number>>({});
  const pointerStateRef = useRef<HeaderPointerState | null>(null);
  const suppressClickRef = useRef(false);

  const canCommitReorder = Boolean(onTabReorder) && tabs.length > 1;
  const canReorder =
    (Boolean(onTabReorder) || Boolean(onTabDragStateChange)) && tabs.length > 0;

  useEffect(() => {
    // While dragging, keep the visual order stable and ignore external
    // order changes to avoid mid-drag jumps.
    if (slidingTabId) return;

    const nextOrder = tabs.map((tab) => tab.id);
    orderRef.current = nextOrder;
    setVisualTabOrder((currentOrder) =>
      areOrdersEqual(currentOrder, nextOrder) ? currentOrder : nextOrder,
    );
  }, [tabs, slidingTabId]);

  const orderedTabs = useMemo(() => {
    const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
    const hasValidVisualOrder =
      visualTabOrder.length === tabs.length &&
      visualTabOrder.every((tabId) => tabsById.has(tabId));

    // If the visual order is stale (tab closed/opened), fall back to the
    // canonical incoming order so rendering never references missing tabs.
    const sourceOrder = hasValidVisualOrder
      ? visualTabOrder
      : tabs.map((tab) => tab.id);

    return sourceOrder
      .map((tabId) => tabsById.get(tabId))
      .filter((tab): tab is HeaderTab => Boolean(tab));
  }, [tabs, visualTabOrder]);

  const clampSlideOffset = useCallback((tabId: string, offsetX: number) => {
    const draggedElement = tabRefs.current[tabId];
    const containerElement = containerRef.current;
    if (!draggedElement || !containerElement) return offsetX;

    // Clamp so the dragged tab stays fully within the header viewport.
    const minOffset = -draggedElement.offsetLeft;
    const maxOffset =
      containerElement.clientWidth -
      (draggedElement.offsetLeft + draggedElement.offsetWidth);

    if (offsetX < minOffset) return minOffset;
    if (offsetX > maxOffset) return maxOffset;
    return offsetX;
  }, []);

  const getIsOutsideHeader = useCallback((clientX: number, clientY: number) => {
    const containerElement = containerRef.current;
    if (!containerElement) return false;
    const bounds = containerElement.getBoundingClientRect();
    return (
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    );
  }, []);

  const emitDragState = useCallback(
    (pointerState: HeaderPointerState | null) => {
      if (!onTabDragStateChange) return;
      if (!pointerState) {
        onTabDragStateChange(null);
        return;
      }
      onTabDragStateChange({
        tabId: pointerState.tabId,
        pointerX: pointerState.lastClientX,
        pointerY: pointerState.lastClientY,
        hasMoved: pointerState.hasMoved,
        isOutsideHeader: getIsOutsideHeader(
          pointerState.lastClientX,
          pointerState.lastClientY,
        ),
        pointerOffsetX: pointerState.pointerOffsetX,
        pointerOffsetY: pointerState.pointerOffsetY,
        tabWidth: pointerState.tabWidth,
        tabHeight: pointerState.tabHeight,
      });
    },
    [getIsOutsideHeader, onTabDragStateChange],
  );

  const finishSliding = useCallback(() => {
    const pointerState = pointerStateRef.current;
    const nextOrder = orderRef.current;

    if (pointerState) {
      const draggedElement = tabRefs.current[pointerState.tabId];
      if (draggedElement?.hasPointerCapture(pointerState.pointerId)) {
        draggedElement.releasePointerCapture(pointerState.pointerId);
      }
    }

    pointerStateRef.current = null;
    setSlidingTabId(null);
    setDraggingTabId(null);
    setSlideOffsetX(0);
    emitDragState(null);

    if (
      pointerState?.hasMoved &&
      onTabReorder &&
      !areOrdersEqual(pointerState.initialOrder, nextOrder)
    )
      onTabReorder(nextOrder);

    if (!pointerState?.hasMoved) return;

    // Prevent the synthetic click after drag that would otherwise fire a
    // tab-select immediately after reorder.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [emitDragState, onTabReorder]);

  useLayoutEffect(() => {
    // FLIP-style animations: compute positions pre-paint so siblings
    // glide into place without a visible jump.
    const nextTabLeftById: Record<string, number> = {};

    for (const tab of orderedTabs) {
      const element = tabRefs.current[tab.id];
      if (!element) continue;

      const nextLeft = element.offsetLeft;
      nextTabLeftById[tab.id] = nextLeft;

      const previousLeft = tabLeftByIdRef.current[tab.id];
      if (previousLeft === undefined || previousLeft === nextLeft) continue;

      if (tab.id === slidingTabId) {
        // Keep the pointer and dragged element in sync when DOM order
        // changes during a swap.
        const domShift = nextLeft - previousLeft;
        if (pointerStateRef.current)
          pointerStateRef.current.startClientX += domShift;
        setSlideOffsetX((prev) => clampSlideOffset(tab.id, prev - domShift));
        continue;
      }

      const deltaX = previousLeft - nextLeft;
      for (const animation of element.getAnimations()) animation.cancel();
      element.animate(
        [
          { transform: `translateX(${deltaX}px)` },
          { transform: "translateX(0)" },
        ],
        { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
      );
    }

    tabLeftByIdRef.current = nextTabLeftById;
  }, [clampSlideOffset, orderedTabs, slidingTabId]);

  const handlePointerMove = useCallback(
    (event: PointerEvent) => {
      const pointerState = pointerStateRef.current;
      if (!pointerState) return;

      const rawDeltaX = event.clientX - pointerState.startClientX;
      const rawDeltaY = event.clientY - pointerState.startClientY;
      pointerState.lastClientX = event.clientX;
      pointerState.lastClientY = event.clientY;

      // "Dragging" begins only after the pointer moves past a small
      // threshold so a plain click never feels draggy.
      if (
        (Math.abs(rawDeltaX) > 16 || Math.abs(rawDeltaY) > 16) &&
        !pointerState.hasMoved
      ) {
        pointerState.hasMoved = true;
        setDraggingTabId(pointerState.tabId);
      }

      const isOutsideHeader = getIsOutsideHeader(event.clientX, event.clientY);
      // Freeze the source tab in the header while the pointer is outside
      // of it — the floating ghost handles the visual.
      const deltaX =
        !isOutsideHeader && canCommitReorder
          ? clampSlideOffset(pointerState.tabId, rawDeltaX)
          : 0;

      setSlideOffsetX(deltaX);
      emitDragState(pointerState);

      // Gate swaps with a movement threshold so tiny cursor jitters do
      // not cause rapid tab-order churn during long drags.
      const swapDistance = Math.abs(event.clientX - pointerState.swapAnchorX);
      if (swapDistance < 8 || isOutsideHeader || !canCommitReorder) return;

      const currentOrder = orderRef.current;
      const currentIndex = currentOrder.indexOf(pointerState.tabId);
      if (currentIndex === -1) return;

      const draggedElement = tabRefs.current[pointerState.tabId];
      if (!draggedElement) return;

      const draggedLeftX = draggedElement.offsetLeft + deltaX;
      const draggedProbeX =
        deltaX >= 0 ? draggedLeftX + draggedElement.offsetWidth : draggedLeftX;

      let nextIndex = 0;
      for (const candidateTabId of currentOrder) {
        if (candidateTabId === pointerState.tabId) continue;
        const element = tabRefs.current[candidateTabId];
        if (!element) continue;
        const candidateCenterX = element.offsetLeft + element.offsetWidth / 2;
        if (draggedProbeX > candidateCenterX) nextIndex += 1;
      }

      if (nextIndex === currentIndex) return;

      const nextOrder = moveTab(currentOrder, currentIndex, nextIndex);
      const hasOrderChanged = nextOrder.some(
        (tabId, index) => currentOrder[index] !== tabId,
      );
      if (!hasOrderChanged) return;

      orderRef.current = nextOrder;
      pointerState.swapAnchorX = event.clientX;
      setVisualTabOrder(nextOrder);
    },
    [canCommitReorder, clampSlideOffset, emitDragState, getIsOutsideHeader],
  );

  useEffect(() => {
    // Global pointer lifecycle only during active drag. Guarantees drag
    // completion even if the pointer leaves tab bounds.
    if (!slidingTabId) return;

    const handleWindowPointerUp = () => finishSliding();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handleWindowPointerUp);
    window.addEventListener("pointercancel", handleWindowPointerUp);
    window.addEventListener("blur", handleWindowPointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handleWindowPointerUp);
      window.removeEventListener("pointercancel", handleWindowPointerUp);
      window.removeEventListener("blur", handleWindowPointerUp);
    };
  }, [finishSliding, handlePointerMove, slidingTabId]);

  const handleTabClick = useCallback(
    (
      event: MouseEvent<HTMLDivElement>,
      tabId: string,
      onTabSelect: (tabId: string) => void,
    ) => {
      if (suppressClickRef.current) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onTabSelect(tabId);
    },
    [],
  );

  const handlePointerDown = useCallback(
    (
      tabId: string,
      event: ReactPointerEvent<HTMLDivElement>,
      onTabSelect: (tabId: string) => void,
    ) => {
      if (event.button !== 0) return;

      // Select first so keyboard/editor state tracks the user's intent
      // even when reorder is not available.
      onTabSelect(tabId);
      if (!canReorder) return;

      const initialOrder =
        visualTabOrder.length === tabs.length
          ? visualTabOrder
          : tabs.map((tab) => tab.id);
      const tabRect = event.currentTarget.getBoundingClientRect();

      orderRef.current = initialOrder;
      setVisualTabOrder(initialOrder);

      pointerStateRef.current = {
        tabId,
        initialOrder,
        startClientX: event.clientX,
        startClientY: event.clientY,
        pointerId: event.pointerId,
        swapAnchorX: event.clientX,
        hasMoved: false,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        pointerOffsetX: event.clientX - tabRect.left,
        pointerOffsetY: event.clientY - tabRect.top,
        tabWidth: tabRect.width,
        tabHeight: tabRect.height,
      };

      setSlidingTabId(tabId);
      setDraggingTabId(null);
      setSlideOffsetX(0);
      event.currentTarget.setPointerCapture(event.pointerId);
      emitDragState(pointerStateRef.current);
    },
    [canReorder, emitDragState, tabs, visualTabOrder],
  );

  const setTabRef = useCallback(
    (tabId: string, node: HTMLDivElement | null) => {
      tabRefs.current[tabId] = node;
    },
    [],
  );

  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
  }, []);

  return {
    canReorder,
    orderedTabs,
    slidingTabId,
    draggingTabId,
    slideOffsetX,
    setContainerRef,
    setTabRef,
    handleTabClick,
    handlePointerDown,
  };
}

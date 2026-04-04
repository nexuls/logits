import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HeaderPointerState, HeaderTab } from "./header-types";
import { areOrdersEqual, moveTab } from "./header-utils";

/**
 * Hook that owns interactive tab reordering behavior.
 *
 * Process overview:
 * 1. Keep a visual order that can diverge from incoming `tabs` while dragging.
 * 2. Track pointer state to compute drag distance and swap decisions.
 * 3. Animate sibling tabs when order changes.
 * 4. Commit reorder only after drag ends and the order actually changed.
 *
 * Constraints:
 * - Preserve tab selection behavior (pointer down still selects immediately).
 * - Avoid accidental reorders from tiny pointer jitter.
 * - Keep DOM reads and writes stable enough for smooth dragging.
 */
type UseHeaderTabReorderParams = {
  tabs: HeaderTab[];
  onTabReorder?: (tabIds: string[]) => void;
};

type UseHeaderTabReorderResult = {
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

export function useHeaderTabReorder({
  tabs,
  onTabReorder,
}: UseHeaderTabReorderParams): UseHeaderTabReorderResult {
  // Drag visual state only. Source-of-truth order remains external until
  // reorder is committed via `onTabReorder`.
  const [slidingTabId, setSlidingTabId] = useState<string | null>(null);
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [slideOffsetX, setSlideOffsetX] = useState(0);
  const [visualTabOrder, setVisualTabOrder] = useState<string[]>([]);

  // Refs are used for high-frequency pointer operations to avoid extra renders.
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const orderRef = useRef<string[]>([]);
  const tabLeftByIdRef = useRef<Record<string, number>>({});
  const pointerStateRef = useRef<HeaderPointerState | null>(null);
  const suppressClickRef = useRef(false);

  // Reordering is disabled if there is no handler or only one tab.
  const canReorder = Boolean(onTabReorder) && tabs.length > 1;

  useEffect(() => {
    // While dragging, we keep the visual order stable and ignore external order
    // changes to avoid mid-drag jumps.
    if (slidingTabId) return;

    const nextOrder = tabs.map((tab) => tab.id);
    orderRef.current = nextOrder;
    setVisualTabOrder((currentOrder) =>
      areOrdersEqual(currentOrder, nextOrder) ? currentOrder : nextOrder,
    );
  }, [tabs, slidingTabId]);

  const orderedTabs = useMemo(() => {
    // Build lookup map once per render to resolve tabs from current visual order.
    const tabsById = new Map(tabs.map((tab) => [tab.id, tab]));
    const hasValidVisualOrder =
      visualTabOrder.length === tabs.length &&
      visualTabOrder.every((tabId) => tabsById.has(tabId));

    // Constraint: if visual order is stale (tab closed/opened), fall back to
    // canonical incoming order so rendering never references missing tabs.
    const sourceOrder = hasValidVisualOrder
      ? visualTabOrder
      : tabs.map((tab) => tab.id);

    return sourceOrder
      .map((tabId) => tabsById.get(tabId))
      .filter((tab): tab is HeaderTab => Boolean(tab));
  }, [tabs, visualTabOrder]);

  const clampSlideOffset = useCallback(
    (tabId: string, offsetX: number) => {
      const draggedElement = tabRefs.current[tabId];
      const containerElement = containerRef.current;
      if (!draggedElement || !containerElement) return offsetX;

      // Boundaries are computed against the tab strip viewport so the dragged
      // tab always remains fully visible inside the header container.
      const minOffset = -draggedElement.offsetLeft;
      const maxOffset =
        containerElement.clientWidth -
        (draggedElement.offsetLeft + draggedElement.offsetWidth);

      if (offsetX < minOffset) return minOffset;
      if (offsetX > maxOffset) return maxOffset;
      return offsetX;
    },
    [],
  );

  const finishSliding = useCallback(() => {
    // Finalize drag lifecycle and release pointer capture if still active.
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

    // Commit reorder only when an actual drag occurred and order changed.
    if (
      pointerState?.hasMoved &&
      onTabReorder &&
      !areOrdersEqual(pointerState.initialOrder, nextOrder)
    )
      onTabReorder(nextOrder);

    if (!pointerState?.hasMoved) return;

    // Prevent the synthetic click that may follow pointerup after drag,
    // otherwise a reorder can unintentionally trigger a select action.
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [onTabReorder]);

  useLayoutEffect(() => {
    // Compute current layout positions and animate tabs into new slots.
    // useLayoutEffect keeps reads/writes before paint to avoid visible flicker.
    const nextTabLeftById: Record<string, number> = {};

    for (const tab of orderedTabs) {
      const element = tabRefs.current[tab.id];
      if (!element) continue;

      // offsetLeft ignores active translateX transforms, so we can calculate
      // stable geometry while animating sibling tabs during reordering.
      const nextLeft = element.offsetLeft;
      nextTabLeftById[tab.id] = nextLeft;

      const previousLeft = tabLeftByIdRef.current[tab.id];
      if (previousLeft === undefined || previousLeft === nextLeft) continue;

      if (tab.id === slidingTabId) {
        // Keep pointer and dragged element in sync when DOM order changes.
        const domShift = nextLeft - previousLeft;
        if (pointerStateRef.current)
          pointerStateRef.current.startClientX += domShift;
        setSlideOffsetX((prev) => clampSlideOffset(tab.id, prev - domShift));
        continue;
      }

      const deltaX = previousLeft - nextLeft;

      element.getAnimations().forEach((animation) => {
        animation.cancel();
      });

      element.animate(
        [
          { transform: `translateX(${deltaX}px)` },
          { transform: "translateX(0)" },
        ],
        {
          duration: 180,
          easing: "cubic-bezier(0.2, 0, 0, 1)",
        },
      );
    }

    tabLeftByIdRef.current = nextTabLeftById;
  }, [clampSlideOffset, orderedTabs, slidingTabId]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const pointerState = pointerStateRef.current;
    if (!pointerState) return;

    // Continuous drag offset from original pointer-down anchor.
    const rawDeltaX = event.clientX - pointerState.startClientX;
    const deltaX = clampSlideOffset(pointerState.tabId, rawDeltaX);
    setSlideOffsetX(deltaX);

    // Dragging state starts only after threshold movement from pointer down.
    // We use raw cursor distance so "grabbing" is based on user intent,
    // independent of clamping at container boundaries.
    if (Math.abs(rawDeltaX) > 16 && !pointerState.hasMoved) {
      pointerState.hasMoved = true;
      setDraggingTabId(pointerState.tabId);
    }

    // We gate swaps with a movement threshold so tiny cursor jitters do not
    // cause rapid tab-order churn while dragging across tight hit targets.
    const swapDistance = Math.abs(event.clientX - pointerState.swapAnchorX);
    if (swapDistance < 8) return;

    const currentOrder = orderRef.current;
    const currentIndex = currentOrder.indexOf(pointerState.tabId);
    if (currentIndex === -1) return;

    const draggedElement = tabRefs.current[pointerState.tabId];
    if (!draggedElement) return;

    const draggedLeftX = draggedElement.offsetLeft + deltaX;
    const draggedProbeX =
      deltaX >= 0 ? draggedLeftX + draggedElement.offsetWidth : draggedLeftX;

    // Recompute insertion index by counting candidate tab centers crossed by
    // the dragged probe point.
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

    // Update visual order and move swap anchor forward so swaps are progressive
    // and less noisy during long drags.
    orderRef.current = nextOrder;
    pointerState.swapAnchorX = event.clientX;
    setVisualTabOrder(nextOrder);
  }, [clampSlideOffset]);

  useEffect(() => {
    // Subscribe to global pointer lifecycle only during active drag.
    // This guarantees drag completion even if pointer leaves tab bounds.
    if (!slidingTabId) return;

    const handleWindowPointerUp = () => {
      finishSliding();
    };

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
      // A click immediately after drag-end is ignored by design.
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
      // Left button only; right/middle clicks must not start drag interactions.
      if (event.button !== 0) return;

      // Select first so keyboard/editor state tracks the user's target tab,
      // even when reorder mode is not available.
      onTabSelect(tabId);
      if (!canReorder) return;

      // Start reorder gesture from current visual order snapshot.
      const initialOrder =
        visualTabOrder.length === tabs.length
          ? visualTabOrder
          : tabs.map((tab) => tab.id);

      orderRef.current = initialOrder;
      setVisualTabOrder(initialOrder);

      pointerStateRef.current = {
        tabId,
        initialOrder,
        startClientX: event.clientX,
        pointerId: event.pointerId,
        swapAnchorX: event.clientX,
        hasMoved: false,
      };

      setSlidingTabId(tabId);
      setDraggingTabId(null);
      setSlideOffsetX(0);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canReorder, tabs, visualTabOrder],
  );

  // Stable callback to register/unregister tab DOM refs from item components.
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

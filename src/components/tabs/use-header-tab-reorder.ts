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

type UseHeaderTabReorderParams = {
  tabs: HeaderTab[];
  onTabReorder?: (tabIds: string[]) => void;
};

type UseHeaderTabReorderResult = {
  canReorder: boolean;
  orderedTabs: HeaderTab[];
  slidingTabId: string | null;
  slideOffsetX: number;
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
  const [slidingTabId, setSlidingTabId] = useState<string | null>(null);
  const [slideOffsetX, setSlideOffsetX] = useState(0);
  const [visualTabOrder, setVisualTabOrder] = useState<string[]>([]);

  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const orderRef = useRef<string[]>([]);
  const tabLeftByIdRef = useRef<Record<string, number>>({});
  const pointerStateRef = useRef<HeaderPointerState | null>(null);
  const suppressClickRef = useRef(false);

  const canReorder = Boolean(onTabReorder) && tabs.length > 1;

  useEffect(() => {
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

    const sourceOrder = hasValidVisualOrder
      ? visualTabOrder
      : tabs.map((tab) => tab.id);

    return sourceOrder
      .map((tabId) => tabsById.get(tabId))
      .filter((tab): tab is HeaderTab => Boolean(tab));
  }, [tabs, visualTabOrder]);

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
    setSlideOffsetX(0);

    if (
      pointerState?.hasMoved &&
      onTabReorder &&
      !areOrdersEqual(pointerState.initialOrder, nextOrder)
    )
      onTabReorder(nextOrder);

    if (!pointerState?.hasMoved) return;

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);
  }, [onTabReorder]);

  useLayoutEffect(() => {
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
        setSlideOffsetX((prev) => prev - domShift);
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
  }, [orderedTabs, slidingTabId]);

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const pointerState = pointerStateRef.current;
    if (!pointerState) return;

    const deltaX = event.clientX - pointerState.startClientX;
    setSlideOffsetX(deltaX);

    if (Math.abs(deltaX) > 4) pointerState.hasMoved = true;

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
  }, []);

  useEffect(() => {
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

      onTabSelect(tabId);
      if (!canReorder) return;

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
      setSlideOffsetX(0);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [canReorder, tabs, visualTabOrder],
  );

  const setTabRef = useCallback(
    (tabId: string, node: HTMLDivElement | null) => {
      tabRefs.current[tabId] = node;
    },
    [],
  );

  return {
    canReorder,
    orderedTabs,
    slidingTabId,
    slideOffsetX,
    setTabRef,
    handleTabClick,
    handlePointerDown,
  };
}

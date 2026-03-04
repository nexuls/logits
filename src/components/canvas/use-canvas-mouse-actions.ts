import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject,
  type WheelEvent,
} from "react";

type Point = {
  x: number;
  y: number;
};

type ViewState = {
  scale: number;
  offset: Point;
};

type UseCanvasMouseActionsParams = {
  viewportRef: RefObject<HTMLDivElement | null>;
  minScale: number;
  maxScale: number;
  zoomIntensity?: number;
  initialScale?: number;
  initialOffset?: Point;
};

const DEFAULT_ZOOM_INTENSITY = 0.0015;
const TRACKPAD_ZOOM_MULTIPLIER = 3.25;
const TRACKPAD_DELTA_THRESHOLD = 16;
const TOOLBAR_ZOOM_FACTOR = 1.2;

function isZoomGesture(
  event: WheelEvent<HTMLDivElement> | globalThis.WheelEvent,
) {
  return event.ctrlKey || event.metaKey || event.deltaZ !== 0;
}

function isLikelyTrackpadZoom(event: WheelEvent<HTMLDivElement>) {
  return (
    event.deltaMode === 0 && Math.abs(event.deltaY) < TRACKPAD_DELTA_THRESHOLD
  );
}

function getZoomedViewState(
  prev: ViewState,
  pointerX: number,
  pointerY: number,
  nextScale: number,
) {
  if (nextScale === prev.scale) {
    return prev;
  }

  const worldX = (pointerX - prev.offset.x) / prev.scale;
  const worldY = (pointerY - prev.offset.y) / prev.scale;

  return {
    scale: nextScale,
    offset: {
      x: pointerX - worldX * nextScale,
      y: pointerY - worldY * nextScale,
    },
  };
}

export function useCanvasMouseActions({
  viewportRef,
  minScale,
  maxScale,
  zoomIntensity = DEFAULT_ZOOM_INTENSITY,
  initialScale = 1,
  initialOffset = { x: 0, y: 0 },
}: UseCanvasMouseActionsParams) {
  const [viewState, setViewState] = useState<ViewState>({
    scale: initialScale,
    offset: initialOffset,
  });
  const [isPanning, setIsPanning] = useState(false);
  const activeTouchesRef = useRef<Map<number, Point>>(new Map());
  const lastPanPointRef = useRef<Point | null>(null);
  const lastPinchCenterRef = useRef<Point | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const preventNativeWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
    };

    viewport.addEventListener("wheel", preventNativeWheel, {
      passive: false,
      capture: true,
    });

    return () => {
      viewport.removeEventListener("wheel", preventNativeWheel, {
        capture: true,
      });
    };
  }, [viewportRef]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (isPanning) return;

      if (!isZoomGesture(event)) {
        const panX =
          event.deltaX +
          (event.shiftKey && event.deltaX === 0 ? event.deltaY : 0);
        const panY = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;

        setViewState((prev) => ({
          ...prev,
          offset: {
            x: prev.offset.x - panX,
            y: prev.offset.y - panY,
          },
        }));

        return;
      }

      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const rect = viewport.getBoundingClientRect();
      const pointerX = event.clientX - rect.left;
      const pointerY = event.clientY - rect.top;

      setViewState((prev) => {
        const effectiveZoomIntensity = isLikelyTrackpadZoom(event)
          ? zoomIntensity * TRACKPAD_ZOOM_MULTIPLIER
          : zoomIntensity;

        const nextScale = Math.min(
          maxScale,
          Math.max(
            minScale,
            prev.scale * Math.exp(-event.deltaY * effectiveZoomIntensity),
          ),
        );

        return getZoomedViewState(prev, pointerX, pointerY, nextScale);
      });
    },
    [maxScale, minScale, viewportRef, zoomIntensity, isPanning],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const pointerX = viewport.clientWidth / 2;
      const pointerY = viewport.clientHeight / 2;

      setViewState((prev) => {
        const nextScale = Math.min(
          maxScale,
          Math.max(minScale, prev.scale * factor),
        );

        return getZoomedViewState(prev, pointerX, pointerY, nextScale);
      });
    },
    [maxScale, minScale, viewportRef],
  );

  const zoomIn = useCallback(() => {
    zoomByFactor(TOOLBAR_ZOOM_FACTOR);
  }, [zoomByFactor]);

  const zoomOut = useCallback(() => {
    zoomByFactor(1 / TOOLBAR_ZOOM_FACTOR);
  }, [zoomByFactor]);

  const resetView = useCallback(() => {
    setViewState({
      scale: initialScale,
      offset: initialOffset,
    });
  }, [initialOffset, initialScale]);

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);

      const point = { x: event.clientX, y: event.clientY };
      activeTouchesRef.current.set(event.pointerId, point);

      const touches = Array.from(activeTouchesRef.current.values());

      if (touches.length === 1) {
        lastPanPointRef.current = touches[0];
        lastPinchCenterRef.current = null;
        lastPinchDistanceRef.current = null;
      }

      if (touches.length >= 2) {
        const first = touches[0];
        const second = touches[1];
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };

        lastPinchCenterRef.current = center;
        lastPinchDistanceRef.current = Math.hypot(
          second.x - first.x,
          second.y - first.y,
        );
      }

      setIsPanning(true);
      return;
    }

    if (event.button !== 1) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }, []);

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        if (!activeTouchesRef.current.has(event.pointerId)) {
          return;
        }

        const point = { x: event.clientX, y: event.clientY };
        activeTouchesRef.current.set(event.pointerId, point);

        const touches = Array.from(activeTouchesRef.current.values());

        if (touches.length === 1) {
          const previous = lastPanPointRef.current;

          if (previous) {
            const deltaX = point.x - previous.x;
            const deltaY = point.y - previous.y;

            setViewState((prev) => ({
              ...prev,
              offset: {
                x: prev.offset.x + deltaX,
                y: prev.offset.y + deltaY,
              },
            }));
          }

          lastPanPointRef.current = point;
          lastPinchCenterRef.current = null;
          lastPinchDistanceRef.current = null;
          return;
        }

        const first = touches[0];
        const second = touches[1];
        const center = {
          x: (first.x + second.x) / 2,
          y: (first.y + second.y) / 2,
        };
        const distance = Math.hypot(second.x - first.x, second.y - first.y);

        const previousCenter = lastPinchCenterRef.current;
        const previousDistance = lastPinchDistanceRef.current;

        const panDeltaX = previousCenter ? center.x - previousCenter.x : 0;
        const panDeltaY = previousCenter ? center.y - previousCenter.y : 0;

        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = center.x - rect.left;
        const pointerY = center.y - rect.top;

        setViewState((prev) => {
          const scaleFactor =
            previousDistance && previousDistance > 0
              ? distance / previousDistance
              : 1;
          const nextScale = Math.min(
            maxScale,
            Math.max(minScale, prev.scale * scaleFactor),
          );

          const zoomed = getZoomedViewState(prev, pointerX, pointerY, nextScale);

          return {
            ...zoomed,
            offset: {
              x: zoomed.offset.x + panDeltaX,
              y: zoomed.offset.y + panDeltaY,
            },
          };
        });

        lastPanPointRef.current = null;
        lastPinchCenterRef.current = center;
        lastPinchDistanceRef.current = distance;
        return;
      }

      if (!isPanning) {
        return;
      }

      setViewState((prev) => ({
        ...prev,
        offset: {
          x: prev.offset.x + event.movementX,
          y: prev.offset.y + event.movementY,
        },
      }));
    },
    [isPanning, maxScale, minScale],
  );

  const endPan = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (event.pointerType === "touch") {
      activeTouchesRef.current.delete(event.pointerId);

      const touches = Array.from(activeTouchesRef.current.values());

      if (touches.length === 0) {
        setIsPanning(false);
        lastPanPointRef.current = null;
        lastPinchCenterRef.current = null;
        lastPinchDistanceRef.current = null;
        return;
      }

      if (touches.length === 1) {
        lastPanPointRef.current = touches[0];
        lastPinchCenterRef.current = null;
        lastPinchDistanceRef.current = null;
      }

      return;
    }

    setIsPanning(false);
  }, []);

  const onDoubleClick = useCallback(() => {
    resetView();
  }, [resetView]);

  return {
    scale: viewState.scale,
    offset: viewState.offset,
    isPanning,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPan,
    onPointerCancel: endPan,
    onDoubleClick,
    zoomIn,
    zoomOut,
    resetView,
  };
}

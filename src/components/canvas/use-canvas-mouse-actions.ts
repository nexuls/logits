import {
  type PointerEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
  type WheelEvent,
} from "react";

import {
  clampScale,
  DEFAULT_SCALE,
  panByScreen,
  type Viewport,
  zoomAt,
} from "@/lib/circuit/coords";
import type { Point } from "@/lib/circuit/schema";

/** The viewport transform, as `coords.ts` defines it. */
type ViewState = Viewport;

type UseCanvasMouseActionsParams = {
  viewportRef: RefObject<HTMLDivElement | null>;
  minScale: number;
  maxScale: number;
  zoomIntensity?: number;
  /** Scale a fresh view — and `resetView` — lands on. */
  initialScale?: number;
  initialOffset?: Point;
  /**
   * Where the view starts for the current `viewKey`: the transform this
   * circuit was last left at, restored from storage. `null` for a circuit
   * with no remembered view, which starts on the initial scale and offset.
   *
   * It is *not* where `resetView` goes — reset means "back to the default
   * framing", which stays `initialScale` at `initialOffset`.
   */
  restoredView?: Viewport | null;
  /**
   * Changing this re-frames the view on the restored view, or on the initial
   * scale and offset when there is none. It is how swapping the document
   * under the canvas starts where that circuit was left rather than
   * inheriting the last one's view.
   */
  viewKey?: string;
  /** Wheel, middle-drag, space-drag and one-finger pan. */
  pannable?: boolean;
  /** Ctrl/Cmd + wheel, pinch and `zoomIn` / `zoomOut`. */
  zoomable?: boolean;
  /**
   * A plain left-drag pans too. Off in the editor, where that drag selects;
   * on where nothing on the canvas can be edited.
   */
  dragToPan?: boolean;
};

const DEFAULT_ZOOM_INTENSITY = 0.0015;
const TRACKPAD_ZOOM_MULTIPLIER = 3.25;
const TRACKPAD_DELTA_THRESHOLD = 16;
const TOOLBAR_ZOOM_FACTOR = 1.2;

/**
 * Module-level so the default `initialOffset` keeps one identity across
 * renders. A fresh `{ x: 0, y: 0 }` per call would make `resetView` a new
 * function every render, and the re-framing effect below would then fire on
 * every render instead of when `viewKey` changes.
 */
const ORIGIN: Point = { x: 0, y: 0 };

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

export function useCanvasMouseActions({
  viewportRef,
  minScale,
  maxScale,
  zoomIntensity = DEFAULT_ZOOM_INTENSITY,
  initialScale = DEFAULT_SCALE,
  initialOffset = ORIGIN,
  restoredView = null,
  viewKey,
  pannable = true,
  zoomable = true,
  dragToPan = false,
}: UseCanvasMouseActionsParams) {
  const [viewState, setViewState] = useState<ViewState>(
    restoredView ?? { scale: initialScale, offset: initialOffset },
  );
  const [isPanning, setIsPanning] = useState(false);
  const [isSpacePressed, setIsSpacePressed] = useState(false);
  const panPointerIdRef = useRef<number | null>(null);
  const panTriggerRef = useRef<"touch" | "middle" | "space" | "drag" | null>(
    null,
  );
  const activeTouchesRef = useRef<Map<number, Point>>(new Map());
  const lastPanPointRef = useRef<Point | null>(null);
  const lastPinchCenterRef = useRef<Point | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!pannable) return;

    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      const tagName = target.tagName;
      return (
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) {
        return;
      }

      if (!isSpacePressed) {
        setIsSpacePressed(true);
      }

      event.preventDefault();
    };

    const onKeyUp = (event: globalThis.KeyboardEvent) => {
      if (event.code !== "Space") {
        return;
      }

      setIsSpacePressed(false);

      if (panTriggerRef.current === "space") {
        setIsPanning(false);
        panPointerIdRef.current = null;
        panTriggerRef.current = null;
      }
    };

    const onWindowBlur = () => {
      setIsSpacePressed(false);
      if (panTriggerRef.current === "space") {
        setIsPanning(false);
        panPointerIdRef.current = null;
        panTriggerRef.current = null;
      }
    };

    window.addEventListener("keydown", onKeyDown, { passive: false });
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [isSpacePressed, pannable]);

  useEffect(() => {
    const viewport = viewportRef.current;

    // Neither gesture is on, so the wheel is the page's again: an embedded
    // canvas that cannot move must not trap the scroll passing over it.
    if (!viewport || (!pannable && !zoomable)) {
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
  }, [viewportRef, pannable, zoomable]);

  const onWheel = useCallback(
    (event: WheelEvent<HTMLDivElement>) => {
      if (!pannable && !zoomable) return;

      event.preventDefault();
      event.stopPropagation();

      if (isPanning) return;

      if (!isZoomGesture(event)) {
        if (!pannable) return;

        const panX =
          event.deltaX +
          (event.shiftKey && event.deltaX === 0 ? event.deltaY : 0);
        const panY = event.shiftKey && event.deltaX === 0 ? 0 : event.deltaY;

        setViewState((prev) => panByScreen(prev, -panX, -panY));

        return;
      }

      if (!zoomable) return;

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

        const nextScale = clampScale(
          prev.scale * Math.exp(-event.deltaY * effectiveZoomIntensity),
          minScale,
          maxScale,
        );

        return zoomAt(prev, { x: pointerX, y: pointerY }, nextScale);
      });
    },
    [
      maxScale,
      minScale,
      viewportRef,
      zoomIntensity,
      isPanning,
      pannable,
      zoomable,
    ],
  );

  const zoomByFactor = useCallback(
    (factor: number) => {
      if (!zoomable) return;

      const viewport = viewportRef.current;

      if (!viewport) {
        return;
      }

      const pointerX = viewport.clientWidth / 2;
      const pointerY = viewport.clientHeight / 2;

      setViewState((prev) => {
        const nextScale = clampScale(prev.scale * factor, minScale, maxScale);

        return zoomAt(prev, { x: pointerX, y: pointerY }, nextScale);
      });
    },
    [maxScale, minScale, viewportRef, zoomable],
  );

  const zoomIn = useCallback(() => {
    zoomByFactor(TOOLBAR_ZOOM_FACTOR);
  }, [zoomByFactor]);

  const zoomOut = useCallback(() => {
    zoomByFactor(1 / TOOLBAR_ZOOM_FACTOR);
  }, [zoomByFactor]);

  const panBy = useCallback((screenDx: number, screenDy: number) => {
    setViewState((prev) => panByScreen(prev, screenDx, screenDy));
  }, []);

  const resetView = useCallback(() => {
    setViewState({
      scale: initialScale,
      offset: initialOffset,
    });
  }, [initialOffset, initialScale]);

  // Read through a ref so the re-framing effect can depend on `viewKey`
  // alone: `restoredView` is a fresh object most renders, and depending on it
  // would make the effect's guard the only thing standing between the user
  // and their view being reset mid-pan.
  const restoredViewRef = useRef(restoredView);
  restoredViewRef.current = restoredView;

  // Re-frames when the caller swaps what is on the canvas, and only then: a
  // change to `initialScale` alone is the user editing the project's default
  // zoom, which must not yank the view out from under the edit they are
  // making. They get the new scale on the next reset, or the next open.
  const framedKeyRef = useRef(viewKey);
  useEffect(() => {
    if (framedKeyRef.current === viewKey) return;
    framedKeyRef.current = viewKey;
    setViewState(
      restoredViewRef.current ?? { scale: initialScale, offset: initialOffset },
    );
  }, [viewKey, initialScale, initialOffset]);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.pointerType === "touch") {
        if (!pannable && !zoomable) return;

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

        panPointerIdRef.current = event.pointerId;
        panTriggerRef.current = "touch";
        setIsPanning(true);
        return;
      }

      if (!pannable) return;

      const isMiddleMousePan = event.button === 1;
      const isSpaceDragPan =
        event.button === 0 && (isSpacePressed || dragToPan);

      if (!isMiddleMousePan && !isSpaceDragPan) {
        return;
      }

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panPointerIdRef.current = event.pointerId;
      panTriggerRef.current = isMiddleMousePan
        ? "middle"
        : isSpacePressed
          ? "space"
          : "drag";
      setIsPanning(true);
    },
    [isSpacePressed, pannable, zoomable, dragToPan],
  );

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

          if (previous && pannable) {
            const deltaX = point.x - previous.x;
            const deltaY = point.y - previous.y;

            setViewState((prev) => panByScreen(prev, deltaX, deltaY));
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

        const panDeltaX =
          pannable && previousCenter ? center.x - previousCenter.x : 0;
        const panDeltaY =
          pannable && previousCenter ? center.y - previousCenter.y : 0;

        const rect = event.currentTarget.getBoundingClientRect();
        const pointerX = center.x - rect.left;
        const pointerY = center.y - rect.top;

        setViewState((prev) => {
          const scaleFactor =
            zoomable && previousDistance && previousDistance > 0
              ? distance / previousDistance
              : 1;
          const nextScale = clampScale(
            prev.scale * scaleFactor,
            minScale,
            maxScale,
          );

          // Pinch does both at once: zoom about the two fingers' midpoint,
          // then follow that midpoint as it travels.
          const zoomed = zoomAt(prev, { x: pointerX, y: pointerY }, nextScale);
          return panByScreen(zoomed, panDeltaX, panDeltaY);
        });

        lastPanPointRef.current = null;
        lastPinchCenterRef.current = center;
        lastPinchDistanceRef.current = distance;
        return;
      }

      if (!isPanning) {
        return;
      }

      setViewState((prev) =>
        panByScreen(prev, event.movementX, event.movementY),
      );
    },
    [isPanning, maxScale, minScale, pannable, zoomable],
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

    if (
      panPointerIdRef.current !== null &&
      event.pointerId !== panPointerIdRef.current
    ) {
      return;
    }

    panPointerIdRef.current = null;
    panTriggerRef.current = null;
    setIsPanning(false);
  }, []);

  const onDoubleClick = useCallback(() => {
    resetView();
  }, [resetView]);

  return {
    scale: viewState.scale,
    offset: viewState.offset,
    isPanning,
    isSpacePressed,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp: endPan,
    onPointerCancel: endPan,
    onDoubleClick,
    zoomIn,
    zoomOut,
    panBy,
    resetView,
  };
}

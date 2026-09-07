"use client";

import {
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { Rect } from "@/lib/circuit/geometry";
import CanvasGrid from "./canvas-grid";
import { type CanvasViewport, createCanvasViewport } from "./canvas-viewport";
import Header from "./components/header";
import Minimap from "./components/minimap";
import { useCanvasMouseActions } from "./use-canvas-mouse-actions";

type Props = {
  /**
   * Rendered inside the transformed layer, in world coordinates — the node and
   * wire layers. The canvas itself knows nothing about what these draw.
   */
  children?: ReactNode;
  /** Rendered in screen space, above the transform: selection chrome, toolbars. */
  overlay?: ReactNode;
  title?: string;
  showGrid?: boolean;
  showMinimap?: boolean;
  /** World-space extent of `children`, for the minimap. Null when empty. */
  contentBounds?: Rect | null;
  /** Passed through to the minimap, which samples theme colours imperatively. */
  themeKey?: string;
  onTitleChange?: (newTitle: string) => void;
  /**
   * Pointer handlers for the editing gestures. They run *before* the viewport's
   * own, and a handler that calls `preventDefault` stops the pan starting —
   * which is how dragging a node does not also drag the canvas.
   */
  onContentPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onContentPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onContentPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  /** Cursor for the viewport while an editing gesture is armed. */
  cursor?: string;
  /**
   * Published whenever the transform moves, so a parent can convert pointer
   * positions with the same numbers the canvas draws with.
   */
  onViewportChange?: (viewport: CanvasViewport) => void;
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export default function Canvas({
  children,
  overlay,
  title = "Untitled circuit",
  showGrid = true,
  showMinimap = true,
  contentBounds = null,
  themeKey,
  onTitleChange,
  onContentPointerDown,
  onContentPointerMove,
  onContentPointerUp,
  cursor,
  onViewportChange,
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const {
    scale,
    offset,
    isPanning,
    isSpacePressed,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onDoubleClick,
    zoomIn,
    zoomOut,
    resetView,
  } = useCanvasMouseActions({
    viewportRef,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  });

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const updateSize = () => {
      setViewportSize({
        width: viewport.clientWidth,
        height: viewport.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);

    return () => {
      observer.disconnect();
    };
  }, []);

  const canvasVars = useMemo(
    () =>
      ({
        "--canvas-x": `${offset.x}px`,
        "--canvas-y": `${offset.y}px`,
        "--canvas-zoom": String(scale),
      }) as CSSProperties,
    [offset.x, offset.y, scale],
  );

  // Rebuilt whenever the transform moves, because consumers convert pointer
  // positions with it and a stale closure would place a node in the wrong spot.
  const viewport = useMemo(
    () => createCanvasViewport({ scale, offset }, viewportRef),
    [scale, offset],
  );

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [onViewportChange, viewport]);

  return (
    <div
      id="logit-canvas"
      className="relative w-full h-full overflow-hidden"
      style={{
        ...canvasVars,
      }}
    >
      <div
        ref={viewportRef}
        className="absolute inset-x-0 top-0 bottom-0 touch-none overscroll-none"
        onPointerDown={(event) => {
          // Space-drag and touch belong to the viewport: the editing
          // gestures must not get first refusal on a pan the user asked for.
          if (!isSpacePressed && event.pointerType !== "touch") {
            onContentPointerDown?.(event);
            if (event.defaultPrevented) return;
          }
          onPointerDown(event);
        }}
        onPointerMove={(event) => {
          onContentPointerMove?.(event);
          onPointerMove(event);
        }}
        onPointerUp={(event) => {
          onContentPointerUp?.(event);
          onPointerUp(event);
        }}
        onPointerCancel={(event) => {
          onContentPointerUp?.(event);
          onPointerCancel(event);
        }}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        style={{
          overscrollBehavior: "none",
          cursor: isPanning
            ? "var(--logit-cursor-grabbing)"
            : isSpacePressed
              ? "var(--logit-cursor-grab)"
              : (cursor ?? "var(--logit-cursor-default)"),
        }}
        role="application"
        aria-label="Canvas with pan and zoom"
      >
        {showGrid && <CanvasGrid scale={scale} offset={offset} />}
        <div
          className="absolute inset-0 select-none"
          style={{
            transformOrigin: "top left",
            transform:
              "translate(var(--canvas-x), var(--canvas-y)) scale(var(--canvas-zoom))",
          }}
        >
          {children}
        </div>

        {overlay}
      </div>

      <Header title={title} onTitleChange={onTitleChange} />

      {showMinimap && (
        <Minimap
          scale={scale}
          offset={offset}
          viewportSize={viewportSize}
          contentBounds={contentBounds}
          themeKey={themeKey}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetView}
          canZoomIn={scale < MAX_SCALE - 0.0001}
          canZoomOut={scale > MIN_SCALE + 0.0001}
        />
      )}
    </div>
  );
}

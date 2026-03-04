"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import CanvasGrid from "./canvas-grid";
import CanvasViewer from "./canvas-viewer";
import { useCanvasMouseActions } from "./use-canvas-mouse-actions";

type Props = {
  content: string;
  onContentChange?: (newContent: string) => void;
};

const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

export default function Canvas({ content }: Props) {
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

  const parsedContent = content.trim();

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
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        style={{
          overscrollBehavior: "none",
          cursor: isPanning
            ? "var(--logit-cursor-grabbing)"
            : isSpacePressed
              ? "var(--logit-cursor-grab)"
              : "var(--logit-cursor-default)",
        }}
        role="application"
        aria-label="Canvas with pan and zoom"
      >
        <CanvasGrid scale={scale} offset={offset} />
        <div
          className="absolute inset-0 select-none"
          style={{
            transformOrigin: "top left",
            transform:
              "translate(var(--canvas-x), var(--canvas-y)) scale(var(--canvas-zoom))",
          }}
        >
          {parsedContent.length > 0 && (
            <div className="rounded-md px-3 py-2 bg-card w-fit">
              {parsedContent}
            </div>
          )}
        </div>
      </div>

      <CanvasViewer
        scale={scale}
        offset={offset}
        viewportSize={viewportSize}
        hasContent={parsedContent.length > 0}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetView={resetView}
        canZoomIn={scale < MAX_SCALE - 0.0001}
        canZoomOut={scale > MIN_SCALE + 0.0001}
      />
    </div>
  );
}

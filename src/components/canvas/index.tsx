"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import CanvasViewer from "./canvas-viewer";
import { useCanvasMouseActions } from "./use-canvas-mouse-actions";

type Props = {
  content: string;
  onContentChange?: (newContent: string) => void;
};

const GRID_SIZE = 24;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function Canvas({ content }: Props) {
  const gridId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const {
    scale,
    offset,
    isPanning,
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

  const gridPatterns = useMemo(() => {
    const unit = Math.max((GRID_SIZE * scale) / 8, 1);
    const grid1 = unit;
    const grid4 = unit * 4;
    const grid16 = unit * 16;
    const grid64 = unit * 64;

    const zoomMin = Math.log2(MIN_SCALE);
    const zoomMax = Math.log2(MAX_SCALE);
    const zoomLevel = clamp(
      (Math.log2(scale) - zoomMin) / (zoomMax - zoomMin),
      0,
      1,
    );

    const majorBaseOpacity = clamp((grid64 - 12) / 140, 0.14, 0.34);
    const mediumBaseOpacity = clamp((grid16 - 6) / 90, 0.1, 0.26);
    const lowBaseOpacity = clamp((grid4 - 6) / 70, 0.06, 0.18);
    const tinyBaseOpacity = clamp((grid1 - 6) / 70, 0.02, 0.1);

    const majorOpacity = clamp(
      majorBaseOpacity * (0.8 + zoomLevel * 0.5),
      0.12,
      0.4,
    );
    const mediumOpacity = clamp(
      mediumBaseOpacity * (0.45 + zoomLevel * 0.85),
      0.05,
      0.33,
    );
    const lowOpacity = clamp(
      lowBaseOpacity * (0.2 + zoomLevel * 1.1),
      0.02,
      0.24,
    );
    const tinyOpacity = clamp(
      tinyBaseOpacity * Math.max(0, (zoomLevel - 0.3) / 0.7),
      0,
      0.14,
    );

    const shiftX = ((offset.x % grid64) + grid64) % grid64;
    const shiftY = ((offset.y % grid64) + grid64) % grid64;

    return {
      levels: [
        { key: "64", size: grid64, opacity: majorOpacity },
        { key: "16", size: grid16, opacity: mediumOpacity },
        { key: "4", size: grid4, opacity: lowOpacity },
        { key: "1", size: grid1, opacity: tinyOpacity },
      ],
      shiftX,
      shiftY,
    };
  }, [offset.x, offset.y, scale]);

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
            : "var(--logit-cursor-default)",
        }}
        role="application"
        aria-label="Canvas with pan and zoom"
      >
        <svg
          className="absolute inset-0 h-full w-full pointer-events-none touch-none contain-strict"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          <defs>
            {gridPatterns.levels.map((level) => {
              const patternId = `${gridId}_grid_${level.key}`;
              const cx = Math.max(level.size - 0.49, 0.5);

              return (
                <pattern
                  key={patternId}
                  id={patternId}
                  width={level.size}
                  height={level.size}
                  patternUnits="userSpaceOnUse"
                  patternTransform={`translate(${gridPatterns.shiftX} ${gridPatterns.shiftY})`}
                >
                  <circle
                    className="tl-grid-dot"
                    cx={cx}
                    cy={0.59}
                    r={1}
                    fill="var(--foreground)"
                    opacity={level.opacity}
                  />
                </pattern>
              );
            })}
          </defs>
          {gridPatterns.levels.map((level) => {
            const patternId = `${gridId}_grid_${level.key}`;

            return (
              <rect
                key={`${patternId}_rect`}
                width="100%"
                height="100%"
                fill={`url(#${patternId})`}
              />
            );
          })}
        </svg>
        <div
          className="absolute inset-0 select-none"
          style={{
            transformOrigin: "top left",
            transform:
              "translate(var(--canvas-x), var(--canvas-y)) scale(var(--canvas-zoom))",
          }}
        >
          {parsedContent.length > 0 && (
            <div className="rounded-md px-3 py-2 bg-card w-fit">{parsedContent}</div>
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

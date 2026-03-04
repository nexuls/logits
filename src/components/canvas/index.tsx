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

const GRID_SIZE = 10;
const MIN_SCALE = 0.05;
const MAX_SCALE = 8;
const GRID_STEPS = [
  { min: -1, mid: 0.15, step: 64 },
  { min: 0.05, mid: 0.375, step: 16 },
  { min: 0.15, mid: 1, step: 4 },
  { min: 0.7, mid: 2.5, step: 1 },
] as const;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function modulate(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
) {
  if (inMax === inMin) {
    return outMax;
  }

  const t = clamp((value - inMin) / (inMax - inMin), 0, 1);
  return outMin + (outMax - outMin) * t;
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
    const z = scale;
    const x = offset.x / z;
    const y = offset.y / z;

    const levels = GRID_STEPS.map(({ step, min, mid }) => {
      const size = Math.max(step * GRID_SIZE * z, 0.001);
      const xo = 0.5 + x * z;
      const yo = 0.5 + y * z;
      const cx = xo > 0 ? xo % size : size + (xo % size);
      const cy = yo > 0 ? yo % size : size + (yo % size);
      const opacity = z < mid ? modulate(z, min, mid, 0, 1) : 1;

      return {
        key: String(step),
        size,
        cx,
        cy,
        opacity: clamp(opacity, 0, 1),
      };
    }).filter((level) => level.opacity > 0.01 && level.size > 1.5);

    return { levels };
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

              return (
                <pattern
                  key={patternId}
                  id={patternId}
                  width={level.size}
                  height={level.size}
                  patternUnits="userSpaceOnUse"
                >
                  <circle
                    cx={level.cx}
                    cy={level.cy}
                    r={1}
                    fill="color-mix(in oklab, var(--muted-foreground) 50%, transparent)"
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

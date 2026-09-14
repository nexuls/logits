"use client";

import { EraserIcon } from "lucide-react";
import { type PointerEvent, useRef, useState } from "react";

import { colorParam } from "@/lib/nodes/define";
import {
  cellsOnLine,
  drawpadResolution,
  type PadCell,
  paintPixels,
  pixelRows,
  storedPixels,
} from "@/lib/nodes/io/drawpad";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

const ARROWS: Record<string, [number, number]> = {
  ArrowUp: [-1, 0],
  ArrowDown: [1, 0],
  ArrowLeft: [0, -1],
  ArrowRight: [0, 1],
};

/**
 * A grid of pixels drawn on with the pointer or the keyboard.
 *
 * SVG in viewBox units of one pixel, so `getScreenCTM` turns a pointer
 * position into a pixel whatever the zoom, and whatever letterboxing
 * `preserveAspectRatio` added to keep the pixels square on a body the row pins
 * made taller than the picture.
 *
 * Every stroke writes `pixels` through `setParams`, coalescing after its first
 * write so the stroke is one undo step.
 */
export default function DrawpadView({
  node,
  def,
  setParams,
  interactive,
}: NodeViewProps) {
  const { columns, rows } = drawpadResolution(node.params);
  const picture = pixelRows(node.params);
  const swatch = colorParam(def, node.params);
  const name = node.label ?? def.title;

  const surface = useRef<SVGSVGElement>(null);
  // The stroke keeps its own copy of the pixels: a quick drag crosses several
  // cells before React re-renders with the params the first one produced.
  const stroke = useRef<{
    lit: boolean;
    last: PadCell;
    pixels: readonly string[];
  } | null>(null);
  // Whether the last keyboard edit was a Shift+arrow draw, so a run of them
  // undoes as one line rather than pixel by pixel.
  const drawingByKey = useRef(false);

  const [cursorAt, setCursor] = useState<PadCell>({ row: 0, column: 0 });
  const [focused, setFocused] = useState(false);
  // Clamped on read: shrinking the pad must not strand the cursor off it.
  const cursor = {
    row: Math.min(cursorAt.row, rows - 1),
    column: Math.min(cursorAt.column, columns - 1),
  };

  // Keyed by position, because position is what a pixel *is*: two lit pixels
  // are not interchangeable.
  const litCells = picture.flatMap((bits, row) =>
    bits
      .split("")
      .map((bit, column) => ({ id: `r${row}c${column}`, row, column, bit }))
      .filter((cell) => cell.bit === "1"),
  );
  const lit = litCells.length;

  const cellAt = (event: PointerEvent, clamp: boolean): PadCell | null => {
    const matrix = surface.current?.getScreenCTM();
    if (!matrix) return null;

    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    const column = Math.floor(point.x);
    const row = Math.floor(point.y);

    if (clamp) {
      return {
        row: Math.min(rows - 1, Math.max(0, row)),
        column: Math.min(columns - 1, Math.max(0, column)),
      };
    }
    return row >= 0 && column >= 0 && row < rows && column < columns
      ? { row, column }
      : null;
  };

  const write = (
    base: readonly string[],
    cells: PadCell[],
    on: boolean,
    coalesce: boolean,
  ) => {
    const next = paintPixels(base, cells, on);
    if (next !== base) setParams({ pixels: next }, { coalesce });
    return next;
  };

  const endStroke = () => {
    stroke.current = null;
  };

  return (
    <div className="flex h-full w-full flex-col gap-0.5">
      <div className="flex shrink-0 items-center justify-between gap-1 text-[8px] leading-none text-muted-foreground">
        <span className="truncate font-mono">
          {columns}×{rows}
        </span>
        <button
          type="button"
          disabled={!interactive || lit === 0}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setParams({ pixels: [] })}
          aria-label={`Clear ${name}`}
          title="Clear"
          className={cn(
            "flex items-center gap-0.5 rounded-xs px-0.5 py-px",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "enabled:hover:bg-muted enabled:hover:text-foreground disabled:opacity-50",
          )}
        >
          <EraserIcon aria-hidden className="size-2.5" />
          Clear
        </button>
      </div>

      <svg
        ref={surface}
        viewBox={`0 0 ${columns} ${rows}`}
        preserveAspectRatio="xMidYMid meet"
        role="application"
        aria-roledescription="draw pad"
        aria-label={`${name}: ${columns} by ${rows}, ${lit} pixels lit. Arrow keys move the cursor, Shift and an arrow draws, Space flips a pixel.`}
        tabIndex={interactive ? 0 : -1}
        className={cn(
          "min-h-0 w-full flex-1 touch-none outline-none",
          interactive ? "cursor-crosshair" : "cursor-default",
        )}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          drawingByKey.current = false;
        }}
        onPointerDown={(event) => {
          if (!interactive || event.button !== 0) return;
          const cell = cellAt(event, false);
          // Off the picture — the letterbox — the press is left to move the
          // node like any other part of its body.
          if (!cell) return;

          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);

          const on = picture[cell.row][cell.column] !== "1";
          const pixels = write(storedPixels(node.params), [cell], on, false);
          stroke.current = { lit: on, last: cell, pixels };
          drawingByKey.current = false;
          setCursor(cell);
        }}
        onPointerMove={(event) => {
          const active = stroke.current;
          if (!active) return;
          const cell = cellAt(event, true);
          if (
            !cell ||
            (cell.row === active.last.row && cell.column === active.last.column)
          ) {
            return;
          }

          const pixels = write(
            active.pixels,
            cellsOnLine(active.last, cell),
            active.lit,
            true,
          );
          stroke.current = { ...active, last: cell, pixels };
          setCursor(cell);
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onLostPointerCapture={endStroke}
        // Handled keys are stopped here so they do not also reach the editor's
        // window listeners — arrows nudge a selection, Space pans the canvas.
        onKeyDown={(event) => {
          if (!interactive) return;
          const arrow = ARROWS[event.key];

          if (arrow) {
            event.preventDefault();
            event.stopPropagation();
            const next = {
              row: Math.min(rows - 1, Math.max(0, cursor.row + arrow[0])),
              column: Math.min(
                columns - 1,
                Math.max(0, cursor.column + arrow[1]),
              ),
            };
            setCursor(next);

            if (event.shiftKey) {
              write(
                storedPixels(node.params),
                cellsOnLine(cursor, next),
                true,
                drawingByKey.current,
              );
              drawingByKey.current = true;
            }
            return;
          }

          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            if (event.repeat) return;
            drawingByKey.current = false;
            write(
              storedPixels(node.params),
              [cursor],
              picture[cursor.row][cursor.column] !== "1",
              false,
            );
          }
        }}
        onKeyUp={(event) => {
          if (event.key === "Shift") drawingByKey.current = false;
          if (event.key === " " || event.key === "Enter") {
            event.stopPropagation();
          }
        }}
      >
        <rect width={columns} height={rows} className="fill-muted" />
        {litCells.map((cell) => (
          <rect
            key={cell.id}
            x={cell.column}
            y={cell.row}
            width={1}
            height={1}
            style={{ fill: swatch }}
          />
        ))}
        <path
          d={gridPath(columns, rows)}
          fill="none"
          strokeWidth={0.5}
          vectorEffect="non-scaling-stroke"
          className="stroke-border"
        />
        <rect
          width={columns}
          height={rows}
          fill="none"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          className={focused ? "stroke-ring" : "stroke-border"}
        />
        {focused && (
          // A thick outline, not a tint, so the cursor reads on a lit pixel
          // and an unlit one alike.
          <rect
            x={cursor.column}
            y={cursor.row}
            width={1}
            height={1}
            fill="none"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
            className="stroke-ring"
          />
        )}
      </svg>
    </div>
  );
}

/** The inner grid lines, one path for the whole pad. */
function gridPath(columns: number, rows: number): string {
  const lines: string[] = [];
  for (let column = 1; column < columns; column++) {
    lines.push(`M${column} 0V${rows}`);
  }
  for (let row = 1; row < rows; row++) {
    lines.push(`M0 ${row}H${columns}`);
  }
  return lines.join("");
}

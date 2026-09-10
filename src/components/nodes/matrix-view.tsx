"use client";

import type { CSSProperties } from "react";

import { colorParam } from "@/lib/nodes/define";
import { matrixSize, rowPinId } from "@/lib/nodes/instruments/matrix";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

/**
 * An n × n panel of lamps, one row per input pin.
 *
 * A CSS grid rather than SVG: the cells are plain rectangles, so the grid does
 * the layout at any zoom for free, and the panel only re-renders when a row it
 * subscribes to moves. It shares the LED colour list through `colorParam`, so
 * an amber panel is the same amber as an amber lamp.
 */
export default function MatrixView({ node, def, readPin }: NodeViewProps) {
  const size = matrixSize(node.params);
  const swatch = colorParam(def, node.params);

  // `readPin` gives a row MSB first, which is already left-to-right: the
  // leftmost lamp is the most significant bit, the way the value reads when it
  // is written down. A short or missing row pads with "Z" rather than shifting
  // the row it belongs to.
  //
  // Flattened to one list keyed by position, because position is what a lamp
  // *is*: two lit lamps are not interchangeable, and a cell must never swap
  // places with its neighbour when one of them changes.
  const cells = Array.from({ length: size }, (_, row) =>
    readPin(rowPinId(row))
      .padStart(size, "Z")
      .slice(-size)
      .split("")
      .map((bit, column) => ({ id: `r${row}c${column}`, bit })),
  ).flat();

  const lit = cells.filter((cell) => cell.bit === "1").length;
  const unknown = cells.some((cell) => cell.bit === "X");

  return (
    <div
      className="grid h-full w-full gap-[1px] p-[2px]"
      style={{
        gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`,
      }}
      role="img"
      aria-label={`${node.label ?? def.title}: ${size} by ${size}, ${lit} lamps lit${
        unknown ? ", some unknown" : ""
      }`}
    >
      {cells.map((cell) => (
        <span
          key={cell.id}
          className={cn(
            "rounded-[1px] border",
            cell.bit === "X"
              ? "border-destructive"
              : cell.bit === "1"
                ? "border-transparent"
                : cell.bit === "0"
                  ? "border-border/40 bg-muted"
                  : "border-border/40 border-dashed",
          )}
          style={cellStyle(cell.bit, swatch)}
        />
      ))}
    </div>
  );
}

/**
 * A lit lamp is its colour; the states colour alone must not carry get a
 * *texture* instead of a hue — an unresolved cell is hatched and a floating
 * one is outlined dashed, both of which survive a colour-blind reading and a
 * greyscale print. A glyph, which is what the smaller displays use, does not
 * fit a cell this size on a 16 x 16 panel.
 */
function cellStyle(
  bit: string,
  swatch: string | undefined,
): CSSProperties | undefined {
  if (bit === "1") {
    return {
      background: swatch,
      boxShadow: `0 0 3px 1px color-mix(in oklab, ${swatch} 55%, transparent)`,
    };
  }
  if (bit === "X") {
    return {
      background:
        "repeating-linear-gradient(45deg, var(--destructive) 0 1px, transparent 1px 3px)",
    };
  }
  return undefined;
}

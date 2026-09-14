"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Rect } from "@/lib/circuit/geometry";
import { cn } from "@/lib/utils";

type Point = {
  x: number;
  y: number;
};

type Size = {
  width: number;
  height: number;
};

type Props = {
  scale: number;
  offset: Point;
  viewportSize: Size;
  /**
   * World-space boxes, one per connected group on the canvas — empty when the
   * canvas is. The minimap draws each as its own footprint and fits the
   * preview around all of them, so panning away from the circuit still shows
   * where the circuit is, and two circuits far apart read as two footprints
   * rather than one rectangle spanning the gap between them.
   */
  contentGroups: readonly Rect[];
  /**
   * Opaque repaint key. The minimap samples `--sidebar` / `--foreground` /
   * `--primary` imperatively, so a theme change is invisible to React and the
   * canvas would keep the old palette until the next pan without this.
   */
  themeKey?: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  /** Where `onResetView` lands, as a percentage — the project's default zoom. */
  resetZoomPercent: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

const VIEWER_WIDTH = 152;
const VIEWER_HEIGHT = 84;
const VIEWER_PADDING = 5;

/**
 * A group of one small node is a fraction of a pixel once a wide canvas is fit
 * into 142px, so every footprint is drawn at least this big — visible as a
 * mark, still honest about where it is.
 */
const MIN_GROUP_PX = 3;
const GROUP_ALPHA = 0.45;
const GROUP_RADIUS = 2;

/**
 * Renders a minimap-style canvas viewer for the main infinite canvas.
 *
 * The viewer projects world coordinates into a fixed-size preview and draws:
 * 1) minimap background + dot field,
 * 2) one translucent footprint per connected group,
 * 3) current viewport as a rounded overlay.
 */
export default function Minimap({
  scale,
  offset,
  viewportSize,
  contentGroups,
  themeKey,
  onZoomIn,
  onZoomOut,
  onResetView,
  resetZoomPercent,
  canZoomIn,
  canZoomOut,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isMinimapHidden, setIsMinimapHidden] = useState(false);
  const zoomPercent = Math.round(scale * 100);

  /**
   * Converts the visible screen viewport into world-space coordinates and
   * computes tight bounds that include both viewport and content.
   */
  const worldView = useMemo(() => {
    const safeScale = Math.max(scale, 0.0001);
    const width = Math.max(viewportSize.width, 1);
    const height = Math.max(viewportSize.height, 1);

    const viewX = -offset.x / safeScale;
    const viewY = -offset.y / safeScale;
    const viewW = width / safeScale;
    const viewH = height / safeScale;

    // With nothing on the canvas the fit is driven by the viewport alone.
    let minX = viewX;
    let minY = viewY;
    let maxX = viewX + viewW;
    let maxY = viewY + viewH;

    for (const group of contentGroups) {
      minX = Math.min(minX, group.x);
      minY = Math.min(minY, group.y);
      maxX = Math.max(maxX, group.x + group.width);
      maxY = Math.max(maxY, group.y + group.height);
    }

    return {
      minX,
      minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      viewport: {
        x: viewX,
        y: viewY,
        width: viewW,
        height: viewH,
      },
    };
  }, [
    contentGroups,
    offset.x,
    offset.y,
    scale,
    viewportSize.height,
    viewportSize.width,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `themeKey` is a repaint trigger, not a value this effect reads — the colours it stands for are sampled from CSS custom properties below.
  useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = VIEWER_WIDTH;
    const cssHeight = VIEWER_HEIGHT;

    // Match backing store to device pixel ratio for crisp rendering.
    canvas.width = Math.floor(cssWidth * dpr);
    canvas.height = Math.floor(cssHeight * dpr);

    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return;
    }

    // Draw using CSS pixel coordinates while keeping DPR sharpness.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Pull theme colors from CSS custom properties.
    const styles = getComputedStyle(canvas);
    const sidebarColor =
      styles.getPropertyValue("--sidebar").trim() || "#11131a";
    const foregroundColor =
      styles.getPropertyValue("--foreground").trim() || "#e6e8ee";
    const primaryColor =
      styles.getPropertyValue("--primary").trim() || foregroundColor;

    const innerX = VIEWER_PADDING;
    const innerY = VIEWER_PADDING;
    const innerW = cssWidth - VIEWER_PADDING * 2;
    const innerH = cssHeight - VIEWER_PADDING * 2;

    // Paint the minimap background.
    ctx.fillStyle = sidebarColor;
    ctx.fillRect(innerX, innerY, innerW, innerH);

    // Fit world bounds into the minimap with a uniform scale to preserve aspect ratio.
    const scaleToMini = Math.min(
      innerW / worldView.width,
      innerH / worldView.height,
    );
    const drawW = worldView.width * scaleToMini;
    const drawH = worldView.height * scaleToMini;
    const drawX = innerX + (innerW - drawW) / 2;
    const drawY = innerY + (innerH - drawH) / 2;

    const worldToMiniX = (x: number) =>
      drawX + (x - worldView.minX) * scaleToMini;
    const worldToMiniY = (y: number) =>
      drawY + (y - worldView.minY) * scaleToMini;

    // One footprint per connected group. They are drawn translucent and may
    // overlap — a group's box is its bounding box, not its shape, so two
    // interleaved circuits legitimately cover the same ground.
    ctx.globalAlpha = GROUP_ALPHA;
    ctx.fillStyle = foregroundColor;
    for (const group of contentGroups) {
      const groupX = worldToMiniX(group.x);
      const groupY = worldToMiniY(group.y);
      const groupW = Math.max(group.width * scaleToMini, MIN_GROUP_PX);
      const groupH = Math.max(group.height * scaleToMini, MIN_GROUP_PX);

      ctx.beginPath();
      ctx.roundRect(groupX, groupY, groupW, groupH, GROUP_RADIUS);
      ctx.fill();
    }

    const viewX = worldToMiniX(worldView.viewport.x);
    const viewY = worldToMiniY(worldView.viewport.y);
    const viewW = Math.max(worldView.viewport.width * scaleToMini, 8);
    const viewH = Math.max(worldView.viewport.height * scaleToMini, 8);

    // Overlay the current viewport as a rounded translucent rect.
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.roundRect(viewX, viewY, viewW, viewH, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
  }, [contentGroups, worldView, themeKey]);

  return (
    <div className="absolute left-0 bottom-0 w-44 rounded-tr-lg bg-sidebar p-2 border-t border-r border-border shadow-chrome">
      <div className="mb-2 flex h-6 items-center gap-2 text-xs">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onZoomOut}
          disabled={!canZoomOut}
          aria-label="Zoom out"
        >
          <MinusIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={onResetView}
          className="min-w-10 px-1 text-center tabular-nums"
          // Names the destination, not just the action: with a project default
          // other than 100% the button no longer does the obvious thing, and
          // the percentage it shows is the *current* zoom, not the target.
          aria-label={`Reset view to ${resetZoomPercent}%`}
          title={`Reset view to ${resetZoomPercent}%`}
        >
          {zoomPercent}%
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onZoomIn}
          disabled={!canZoomIn}
          aria-label="Zoom in"
        >
          <PlusIcon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setIsMinimapHidden((prev) => !prev);
          }}
          className="ml-auto"
          aria-label={isMinimapHidden ? "Show minimap" : "Hide minimap"}
        >
          {isMinimapHidden ? <ChevronUpIcon /> : <ChevronDownIcon />}
        </Button>
      </div>
      <div
        className={cn(
          "overflow-hidden transition-all duration-200 ease-out",
          isMinimapHidden ? "max-h-0 opacity-0" : "max-h-40 opacity-100",
        )}
      >
        <canvas
          ref={canvasRef}
          width={VIEWER_WIDTH}
          height={VIEWER_HEIGHT}
          className="block h-auto w-full rounded-sm border"
          aria-label="Canvas viewer"
        />
      </div>
    </div>
  );
}

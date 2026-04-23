"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MinusIcon,
  PlusIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

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
  hasContent: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  canZoomIn: boolean;
  canZoomOut: boolean;
};

const VIEWER_WIDTH = 152;
const VIEWER_HEIGHT = 84;
const VIEWER_PADDING = 5;

/**
 * Renders a minimap-style canvas viewer for the main infinite canvas.
 *
 * The viewer projects world coordinates into a fixed-size preview and draws:
 * 1) minimap background + dot field,
 * 2) optional content footprint,
 * 3) current viewport as a rounded overlay.
 */
export default function CanvasViewer({
  scale,
  offset,
  viewportSize,
  hasContent,
  onZoomIn,
  onZoomOut,
  onResetView,
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

    const contentW = hasContent ? 360 : 0;
    const contentH = hasContent ? 120 : 0;
    const contentX = hasContent ? 0 : viewX;
    const contentY = hasContent ? 0 : viewY;

    const minX = Math.min(viewX, contentX);
    const minY = Math.min(viewY, contentY);
    const maxX = Math.max(viewX + viewW, contentX + contentW);
    const maxY = Math.max(viewY + viewH, contentY + contentH);

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
      content: {
        x: contentX,
        y: contentY,
        width: contentW,
        height: contentH,
      },
    };
  }, [
    hasContent,
    offset.x,
    offset.y,
    scale,
    viewportSize.height,
    viewportSize.width,
  ]);

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

    // Show the content footprint in minimap space when content exists.
    ctx.globalAlpha = 0.5;
    if (hasContent) {
      const contentX = worldToMiniX(worldView.content.x);
      const contentY = worldToMiniY(worldView.content.y);
      const contentW = Math.max(worldView.content.width * scaleToMini, 10);
      const contentH = Math.max(worldView.content.height * scaleToMini, 6);

      ctx.fillStyle = foregroundColor;
      ctx.fillRect(contentX, contentY, contentW, contentH);
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
  }, [hasContent, worldView]);

  return (
    <div className="absolute left-0 bottom-0 w-44 rounded-tr-lg bg-sidebar p-2">
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
          aria-label="Reset zoom and position"
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
          {isMinimapHidden ? <ChevronRightIcon /> : <ChevronLeftIcon />}
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

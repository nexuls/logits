"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { MAX_ZOOM, MIN_ZOOM, ZOOM_PRESETS, ZOOM_STEP } from "./constants";
import { buildPdfDocumentHtml } from "./render";
import type { PdfOptions, PdfTheme } from "./types";

type Props = {
  contentHtml: string;
  contentCss: string;
  options: PdfOptions;
  theme: PdfTheme;
  className?: string;
  showControlsToggle?: boolean;
  controlsOpen?: boolean;
  onToggleControlsAction?: () => void;
};

function clampZoom(value: number): number {
  if (value < MIN_ZOOM) return MIN_ZOOM;
  if (value > MAX_ZOOM) return MAX_ZOOM;
  return Math.round(value * 100) / 100;
}

/**
 * Live, fully self-contained preview of the generated PDF.
 *
 * The preview is rendered inside an isolated iframe so the host page's
 * stylesheets cannot leak into the page content (keeping print fidelity
 * high). A transform-scale wrapper provides zoom with button, preset, and
 * Ctrl+wheel controls.
 */
export function PdfPreview({
  contentHtml,
  contentCss,
  options,
  theme,
  className,
  showControlsToggle = false,
  controlsOpen = false,
  onToggleControlsAction,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const zoomRef = useRef(zoom);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const applyFrameZoom = useCallback((nextZoom: number) => {
    const frameDoc = iframeRef.current?.contentDocument;
    if (!frameDoc?.body) return;
    frameDoc.body.style.zoom = String(nextZoom);
    frameDoc.body.style.transformOrigin = "top center";
  }, []);

  const documentHtml = useMemo(
    () =>
      buildPdfDocumentHtml({
        contentHtml,
        contentCss,
        options,
        theme,
        forPreview: true,
      }),
    [contentHtml, contentCss, options, theme],
  );

  const adjustZoom = useCallback((delta: number) => {
    setZoom((current) => clampZoom(current + delta));
  }, []);

  const fitToViewport = useCallback(() => {
    const container = containerRef.current;
    const frameDoc = iframeRef.current?.contentDocument;
    const page = frameDoc?.querySelector<HTMLElement>(".pdf-page");
    if (!container || !page) {
      setZoom(1);
      return;
    }

    const currentZoom = zoomRef.current || 1;
    const pageRect = page.getBoundingClientRect();
    const basePageWidth = pageRect.width / currentZoom;
    const basePageHeight = pageRect.height / currentZoom;
    if (basePageWidth <= 0 || basePageHeight <= 0) {
      setZoom(1);
      return;
    }

    // Reserve a small gutter so the fitted page doesn't touch scroll edges.
    const horizontalPadding = 16;
    const verticalPadding = 24;
    const availableWidth = Math.max(container.clientWidth - horizontalPadding, 1);
    const availableHeight = Math.max(container.clientHeight - verticalPadding, 1);
    const nextZoom = clampZoom(
      Math.min(availableWidth / basePageWidth, availableHeight / basePageHeight),
    );

    setZoom(nextZoom);
  }, []);

  // Block the browser's default ctrl-wheel page zoom while the pointer is
  // over the preview and apply custom zooming.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const nativeWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const step = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom((current) => clampZoom(current + step));
    };
    container.addEventListener("wheel", nativeWheel, {
      passive: false,
      capture: true,
    });
    return () => container.removeEventListener("wheel", nativeWheel);
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let cleanup: (() => void) | null = null;

    const bindIframeWheel = () => {
      const frameWindow = iframe.contentWindow;
      if (!frameWindow) return;

      applyFrameZoom(zoomRef.current);

      const frameWheel = (event: WheelEvent) => {
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const step = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        setZoom((current) => clampZoom(current + step));
      };

      frameWindow.addEventListener("wheel", frameWheel, {
        passive: false,
        capture: true,
      });

      cleanup = () => {
        frameWindow.removeEventListener("wheel", frameWheel);
      };
    };

    iframe.addEventListener("load", bindIframeWheel);
    bindIframeWheel();

    return () => {
      iframe.removeEventListener("load", bindIframeWheel);
      cleanup?.();
    };
  }, [applyFrameZoom]);

  useEffect(() => {
    applyFrameZoom(zoom);
  }, [applyFrameZoom, zoom]);

  const zoomPercent = Math.round(zoom * 100);
  const selectValue = ZOOM_PRESETS.includes(zoom) ? String(zoom) : "custom";

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto p-2 @5xl:pl-0 bg-background"
      >
        <iframe
          ref={iframeRef}
          title={`${options.title || "Document"} PDF preview`}
          srcDoc={documentHtml}
          className="h-full w-full bg-transparent rounded-lg border border-[#e5e7eb]"
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-xl border border-border bg-background/95 px-2 py-1 shadow-lg backdrop-blur">
          {showControlsToggle && onToggleControlsAction ? (
            <>
              <Button
                type="button"
                variant={controlsOpen ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={onToggleControlsAction}
                aria-expanded={controlsOpen}
                aria-label={controlsOpen ? "Hide PDF controls" : "Show PDF controls"}
                className="@5xl:hidden"
              >
                <SlidersHorizontal className="size-3.5" />
              </Button>
              <div className="mx-1 h-4 w-px bg-border @5xl:hidden" />
            </>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => adjustZoom(-ZOOM_STEP)}
            aria-label="Zoom out"
          >
            <Minus className="size-3.5" />
          </Button>

          <Select
            value={selectValue}
            onValueChange={(value) => {
              if (value === "custom") return;
              setZoom(clampZoom(Number(value)));
            }}
          >
            <SelectTrigger className="h-7 w-24 border-0 bg-transparent px-2 text-xs">
              <SelectValue>{zoomPercent}%</SelectValue>
            </SelectTrigger>
            <SelectContent align="center">
              {ZOOM_PRESETS.map((preset) => (
                <SelectItem key={preset} value={String(preset)}>
                  {Math.round(preset * 100)}%
                </SelectItem>
              ))}
              {!ZOOM_PRESETS.includes(zoom) ? (
                <SelectItem value="custom" disabled>
                  {zoomPercent}% (custom)
                </SelectItem>
              ) : null}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => adjustZoom(ZOOM_STEP)}
            aria-label="Zoom in"
          >
            <Plus className="size-3.5" />
          </Button>

          <div className="mx-1 h-4 w-px bg-border" />

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={fitToViewport}
            aria-label="Fit page to viewport"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

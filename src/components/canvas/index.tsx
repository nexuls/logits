"use client";

import {
  type CSSProperties,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  DEFAULT_SCALE,
  MAX_SCALE,
  MIN_SCALE,
  type Viewport,
} from "@/lib/circuit/coords";
import type { Rect } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import { cn } from "@/lib/utils";
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
  /** The floating title in the top-left corner. */
  showHeader?: boolean;
  /** The header's projects button, which needs a `SidebarProvider` above it. */
  showSidebarToggle?: boolean;
  /**
   * Scale the view starts at and that "reset view" returns to. The document
   * owns this number; the canvas only renders at it.
   */
  defaultZoom?: number;
  /**
   * Where the world origin sits on screen at `defaultZoom`: the other half of
   * the default framing. Keep its identity stable between renders.
   */
  defaultOffset?: Point;
  /**
   * Identifies what is on the canvas. When it changes the view re-frames on
   * `restoredView`, or on `defaultZoom` when there is none — how opening
   * another circuit starts where that circuit was left instead of inheriting
   * the previous one's view.
   */
  viewKey?: string;
  /**
   * The transform to start `viewKey` at: where the user last left this
   * circuit. `null` starts on `defaultZoom` at the origin, which is also
   * where "reset view" goes regardless of this.
   */
  restoredView?: Viewport | null;
  /**
   * World-space extent of `children`, one box per connected group, for the
   * minimap. Empty when there is nothing on the canvas.
   */
  contentGroups?: readonly Rect[];
  /** Passed through to the minimap, which samples theme colours imperatively. */
  themeKey?: string;
  onTitleChange?: (newTitle: string) => void;
  /** Controls the header title's edit mode — how a menu's "Rename" opens it. */
  titleEditing?: boolean;
  onTitleEditingChange?: (editing: boolean) => void;
  /** Rendered beside the title. The canvas knows nothing about what it offers. */
  headerMenu?: ReactNode;
  /**
   * Pointer handlers for the editing gestures. They run *before* the viewport's
   * own, and a handler that calls `preventDefault` stops the pan starting —
   * which is how dragging a node does not also drag the canvas.
   */
  onContentPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  onContentPointerMove?: (event: PointerEvent<HTMLDivElement>) => void;
  onContentPointerUp?: (event: PointerEvent<HTMLDivElement>) => void;
  /** The pointer left the canvas — what a cursor-following preview hides on. */
  onContentPointerLeave?: () => void;
  /**
   * A double-click on the content, after both of its presses have gone
   * through `onContentPointerDown`. The editing gestures open a node for
   * editing on it.
   */
  onContentDoubleClick?: (event: MouseEvent<HTMLDivElement>) => void;
  /** Cursor for the viewport while an editing gesture is armed. */
  cursor?: string;
  /** Wheel, middle-drag, space-drag and touch pan. */
  pannable?: boolean;
  /** Ctrl/Cmd + wheel, pinch, and the minimap's zoom buttons. */
  zoomable?: boolean;
  /** A plain left-drag pans, for a canvas with no editing gestures on it. */
  dragToPan?: boolean;
  /**
   * Published whenever the transform moves, so a parent can convert pointer
   * positions with the same numbers the canvas draws with.
   */
  onViewportChange?: (viewport: CanvasViewport) => void;
};

/** Stable identity, so the default does not re-render the minimap every frame. */
const EMPTY_GROUPS: readonly Rect[] = [];

export default function Canvas({
  children,
  overlay,
  title = "Untitled circuit",
  showGrid = true,
  showMinimap = true,
  showHeader = true,
  showSidebarToggle = true,
  defaultZoom = DEFAULT_SCALE,
  defaultOffset,
  viewKey,
  restoredView = null,
  contentGroups = EMPTY_GROUPS,
  themeKey,
  onTitleChange,
  titleEditing,
  onTitleEditingChange,
  headerMenu,
  onContentPointerDown,
  onContentPointerMove,
  onContentPointerUp,
  onContentPointerLeave,
  onContentDoubleClick,
  cursor,
  pannable = true,
  zoomable = true,
  dragToPan = false,
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
    // onDoubleClick,
    zoomIn,
    zoomOut,
    panBy,
    resetView,
  } = useCanvasMouseActions({
    viewportRef,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    initialScale: defaultZoom,
    initialOffset: defaultOffset,
    pannable,
    zoomable,
    dragToPan,
    restoredView,
    viewKey,
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

  /**
   * The pan/zoom transform, written straight onto the layer that carries it.
   *
   * It used to travel as three inherited custom properties on the container
   * (`--canvas-x`, `--canvas-y`, `--canvas-zoom`) which this layer read back
   * through `var()`. That is what a changing custom property costs: the
   * browser cannot know the value only feeds a `transform`, so every change
   * invalidates the whole inheriting subtree and relayouts it. Measured at the
   * 2,000-node target, one frame of panning was 220 ms of layout; the same
   * frames writing `transform` here directly are 0.2 ms. See
   * artifacts/decisions/0013-the-transform-is-a-style-not-a-variable.md.
   */
  const transform = useMemo(
    () =>
      ({
        transformOrigin: "top left",
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      }) as CSSProperties,
    [offset.x, offset.y, scale],
  );

  // Rebuilt whenever the transform moves, because consumers convert pointer
  // positions with it and a stale closure would place a node in the wrong spot.
  const viewport = useMemo(
    () => createCanvasViewport({ scale, offset }, viewportRef, panBy),
    [scale, offset, panBy],
  );

  useEffect(() => {
    onViewportChange?.(viewport);
  }, [onViewportChange, viewport]);

  return (
    // A named container, not viewport breakpoints: the chrome floating on the
    // canvas has to fit the *canvas*, and the two sidebars change how wide that
    // is without the viewport changing at all. Everything inside sizes itself
    // with `@min-[…]/canvas` / `@max-[…]/canvas`.
    <div className="@container/canvas relative w-full h-full overflow-hidden">
      <div
        ref={viewportRef}
        className={cn(
          "absolute inset-x-0 top-0 bottom-0",
          // Touch goes to the page when the canvas has nothing to do with it.
          (pannable || zoomable) && "touch-none overscroll-none",
        )}
        onPointerDown={(event) => {
          // Every gesture (and every pan) calls `preventDefault` on the press,
          // which also cancels the compatibility mousedown whose default
          // action moves focus. Without this, an input outside the press — the
          // title being renamed, an inspector field — keeps focus and never
          // gets the blur that commits it.
          const focused = document.activeElement;
          if (
            focused instanceof HTMLElement &&
            focused !== document.body &&
            !focused.contains(event.target as Node)
          ) {
            focused.blur();
          }

          // Space-drag and touch belong to the viewport: the editing
          // gestures must not get first refusal on a pan the user asked for.
          if (!isSpacePressed && event.pointerType !== "touch") {
            onContentPointerDown?.(event);
            if (event.defaultPrevented) {
              // Captured so a drag keeps its moves and its release while the
              // pointer crosses the overlay, header or minimap, which are
              // siblings of the viewport and would otherwise swallow them.
              event.currentTarget.setPointerCapture(event.pointerId);
              return;
            }
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
        onPointerLeave={() => onContentPointerLeave?.()}
        // A right-click branches a wire through `onContentPointerDown`
        // (button 2); this only has to keep the browser's own menu off it.
        onContextMenu={(event) => event.preventDefault()}
        onWheel={onWheel}
        onDoubleClick={onContentDoubleClick}
        style={{
          overscrollBehavior: "none",
          cursor: isPanning
            ? "var(--logit-cursor-grabbing)"
            : isSpacePressed
              ? "var(--logit-cursor-grab)"
              : (cursor ??
                (dragToPan && pannable
                  ? "var(--logit-cursor-grab)"
                  : "var(--logit-cursor-default)")),
        }}
        role="application"
        aria-label="Canvas with pan and zoom"
      >
        {showGrid && <CanvasGrid scale={scale} offset={offset} />}
        <div className="absolute inset-0 select-none" style={transform}>
          {children}
        </div>
      </div>

      {/* A sibling of the viewport, not a child: picking is arithmetic against
          the scene, so a press on a toolbar button that bubbled into the
          viewport would also select or start a wire on whatever lies under it. */}
      {overlay}

      {showHeader && (
        <Header
          title={title}
          onTitleChange={onTitleChange}
          titleEditing={titleEditing}
          onTitleEditingChange={onTitleEditingChange}
          menu={headerMenu}
          showSidebarToggle={showSidebarToggle}
        />
      )}

      {showMinimap && (
        <Minimap
          scale={scale}
          offset={offset}
          viewportSize={viewportSize}
          contentGroups={contentGroups}
          themeKey={themeKey}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onResetView={resetView}
          resetZoomPercent={Math.round(defaultZoom * 100)}
          canZoomIn={zoomable && scale < MAX_SCALE - 0.0001}
          canZoomOut={zoomable && scale > MIN_SCALE + 0.0001}
        />
      )}
    </div>
  );
}

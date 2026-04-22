import type {
  DropSide,
  HoverTarget,
  PreviewRect,
  WorkspaceDragState,
  WorkspaceLayout,
} from "./types";
import { getPaneIds } from "./layout-operations";

// Proportion of a pane's side, counted from the edge, that counts as the
// "edge" drop zone. Beyond this threshold the pointer is treated as a
// center (header-insert) drop instead of a split.
const EDGE_TARGET_RATIO = 0.26;

/** Strict "point lies inside DOMRect" test (inclusive on all sides). */
export function pointInsideRect(x: number, y: number, rect: DOMRect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * Given a header row and a pointer X coordinate, compute the insertion
 * index the dragged tab would occupy inside that header.
 */
export function getHeaderInsertIndex(
  headerNode: HTMLDivElement | null,
  pointerX: number,
) {
  if (!headerNode) return 0;

  const tabElements = Array.from(
    headerNode.querySelectorAll<HTMLElement>("[data-tab-id]"),
  );
  if (tabElements.length === 0) return 0;

  let nextIndex = 0;
  for (const tabElement of tabElements) {
    const rect = tabElement.getBoundingClientRect();
    if (pointerX > rect.left + rect.width / 2) nextIndex += 1;
  }
  return nextIndex;
}

/**
 * Resolve which drop side a pointer is triggering for a specific pane.
 * Returns `null` if the pointer is outside the pane.
 */
export function getPaneHoverTarget(
  paneRect: DOMRect,
  headerRect: DOMRect | null,
  pointerX: number,
  pointerY: number,
): DropSide | null {
  if (!pointInsideRect(pointerX, pointerY, paneRect)) return null;

  if (headerRect && pointInsideRect(pointerX, pointerY, headerRect)) {
    return "center";
  }

  const leftDistance = pointerX - paneRect.left;
  const rightDistance = paneRect.right - pointerX;
  const topDistance = pointerY - paneRect.top;
  const bottomDistance = paneRect.bottom - pointerY;
  const edgeThresholdX = paneRect.width * EDGE_TARGET_RATIO;
  const edgeThresholdY = paneRect.height * EDGE_TARGET_RATIO;
  const edgeCandidates: Array<{
    side: Exclude<DropSide, "center">;
    distance: number;
  }> = [
    { side: "left", distance: leftDistance },
    { side: "right", distance: rightDistance },
    { side: "top", distance: topDistance },
    { side: "bottom", distance: bottomDistance },
  ];

  const closestEdge = edgeCandidates.sort(
    (first, second) => first.distance - second.distance,
  )[0];
  if (!closestEdge) return null;

  if (
    (closestEdge.side === "left" || closestEdge.side === "right") &&
    closestEdge.distance <= edgeThresholdX
  ) {
    return closestEdge.side;
  }

  if (
    (closestEdge.side === "top" || closestEdge.side === "bottom") &&
    closestEdge.distance <= edgeThresholdY
  ) {
    return closestEdge.side;
  }

  return "center";
}

/**
 * Walk every pane in the layout and find the first one that contains
 * the drag pointer, returning the drop side + (optional) insertion
 * index within that pane's header.
 */
export function resolveHoverTarget(
  layout: WorkspaceLayout | null,
  paneRefs: Record<string, HTMLDivElement | null>,
  headerRefs: Record<string, HTMLDivElement | null>,
  dragState: WorkspaceDragState | null,
): HoverTarget | null {
  if (!layout || !dragState?.hasMoved || !dragState.isOutsideHeader)
    return null;

  for (const paneId of getPaneIds(layout)) {
    const paneRect = paneRefs[paneId]?.getBoundingClientRect();
    if (!paneRect) continue;

    const headerNode = headerRefs[paneId];
    const headerRect = headerNode?.getBoundingClientRect() ?? null;
    const side = getPaneHoverTarget(
      paneRect,
      headerRect,
      dragState.pointerX,
      dragState.pointerY,
    );
    if (!side) continue;

    const isInsideHeader = headerRect
      ? pointInsideRect(dragState.pointerX, dragState.pointerY, headerRect)
      : false;

    return {
      paneId,
      side,
      index:
        side === "center" && isInsideHeader
          ? getHeaderInsertIndex(headerNode, dragState.pointerX)
          : undefined,
    };
  }
  return null;
}

/**
 * Build the rectangle used to render the drop-preview overlay for the
 * current hover target. Coordinates are returned in root-local space so
 * the caller can render with absolute positioning.
 */
export function getPreviewRect(
  rootNode: HTMLDivElement | null,
  paneNode: HTMLDivElement | null,
  hoverTarget: HoverTarget | null,
): PreviewRect | null {
  if (!rootNode || !paneNode || !hoverTarget) return null;

  const rootRect = rootNode.getBoundingClientRect();
  const paneRect = paneNode.getBoundingClientRect();
  const inset = 8;

  if (hoverTarget.side === "center") {
    // When the pointer is inside a header and would cause a reorder (not
    // a whole-pane merge), we hide the overlay to reduce visual noise.
    if (hoverTarget.index !== undefined) return null;
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width - inset * 2),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "left") {
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width / 2 - inset * 1.5),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "right") {
    return {
      x: paneRect.left - rootRect.left + paneRect.width / 2,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width / 2 - inset * 1.5),
      height: Math.max(80, paneRect.height - inset * 2),
    };
  }

  if (hoverTarget.side === "top") {
    return {
      x: paneRect.left - rootRect.left + inset,
      y: paneRect.top - rootRect.top + inset,
      width: Math.max(80, paneRect.width - inset * 2),
      height: Math.max(80, paneRect.height / 2 - inset * 1.5),
    };
  }

  return {
    x: paneRect.left - rootRect.left + inset,
    y: paneRect.top - rootRect.top + paneRect.height / 2,
    width: Math.max(80, paneRect.width - inset * 2),
    height: Math.max(80, paneRect.height / 2 - inset * 1.5),
  };
}

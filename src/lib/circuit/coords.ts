import type { Rect } from "./geometry";
import type { Point } from "./schema";

/**
 * World ↔ screen conversion.
 *
 * The canvas draws one transformed layer, `translate(offset) scale(scale)`, so
 * the whole mapping is `screen = world * scale + offset`. Every conversion in
 * the app goes through this module rather than re-deriving that inline — the
 * two spaces are easy to mix up and impossible to tell apart from a `number`,
 * so the fix is to have one place that knows the direction.
 *
 * Screen coordinates here are **viewport-relative** (what you get by
 * subtracting the viewport's bounding rect from a pointer event), never page
 * or client coordinates. Reading that rect is the component's job; this layer
 * stays pure. See artifacts/02-architecture.md.
 */

/** The canvas transform. `offset` is where the world origin sits on screen. */
export type Viewport = {
  scale: number;
  offset: Point;
};

/** Screen size of a viewport, in CSS pixels. */
export type ViewportSize = { width: number; height: number };

export function toScreen(world: Point, view: Viewport): Point {
  return {
    x: world.x * view.scale + view.offset.x,
    y: world.y * view.scale + view.offset.y,
  };
}

export function toWorld(screen: Point, view: Viewport): Point {
  return {
    x: (screen.x - view.offset.x) / view.scale,
    y: (screen.y - view.offset.y) / view.scale,
  };
}

/**
 * Lengths, not positions: a hit-test radius of 8 screen px is a different
 * number of world units at every zoom, and the offset must not apply to it.
 */
export function screenToWorldLength(screenLength: number, view: Viewport) {
  return screenLength / view.scale;
}

export function worldToScreenLength(worldLength: number, view: Viewport) {
  return worldLength * view.scale;
}

export function rectToScreen(rect: Rect, view: Viewport): Rect {
  const origin = toScreen({ x: rect.x, y: rect.y }, view);

  return {
    x: origin.x,
    y: origin.y,
    width: rect.width * view.scale,
    height: rect.height * view.scale,
  };
}

export function rectToWorld(rect: Rect, view: Viewport): Rect {
  const origin = toWorld({ x: rect.x, y: rect.y }, view);

  return {
    x: origin.x,
    y: origin.y,
    width: rect.width / view.scale,
    height: rect.height / view.scale,
  };
}

/** The slice of the world a viewport of `size` screen pixels can see. */
export function visibleWorldRect(view: Viewport, size: ViewportSize): Rect {
  return rectToWorld({ x: 0, y: 0, ...size }, view);
}

/** Centre of the visible world — where a node goes when placed without a point. */
export function viewportCenterWorld(view: Viewport, size: ViewportSize): Point {
  return toWorld({ x: size.width / 2, y: size.height / 2 }, view);
}

export function clampScale(scale: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, scale));
}

/**
 * Rescales while keeping the world point under `screenAnchor` pinned there —
 * what makes wheel-zoom track the pointer instead of the origin.
 */
export function zoomAt(
  view: Viewport,
  screenAnchor: Point,
  nextScale: number,
): Viewport {
  if (nextScale === view.scale) {
    return view;
  }

  const world = toWorld(screenAnchor, view);

  return {
    scale: nextScale,
    offset: {
      x: screenAnchor.x - world.x * nextScale,
      y: screenAnchor.y - world.y * nextScale,
    },
  };
}

/** Pans by a screen-space delta, e.g. a drag or a wheel event. */
export function panByScreen(view: Viewport, dx: number, dy: number): Viewport {
  return {
    scale: view.scale,
    offset: { x: view.offset.x + dx, y: view.offset.y + dy },
  };
}

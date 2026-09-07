import { toWorld, type Viewport } from "@/lib/circuit/coords";
import type { Point } from "@/lib/circuit/schema";

/**
 * The canvas transform, published to whatever renders on top of it.
 *
 * There is exactly one pan/zoom implementation (Non-negotiable #6) and it
 * lives in `use-canvas-mouse-actions.ts`, in React state. The editor's
 * gestures need the same numbers to convert pointer positions, so the canvas
 * hands this out through `onViewportChange` rather than anyone deriving a
 * second transform.
 *
 * It is a prop and not a context because the consumer sits *above* the canvas
 * — it is what supplies the canvas's children — so there is no provider it
 * could be underneath.
 *
 * `toWorld` here takes **client** coordinates straight off a pointer event and
 * subtracts the viewport's own rect, which is the one part of the conversion
 * that needs the DOM and so cannot live in `coords.ts`.
 */

export type CanvasViewport = Viewport & {
  /** Client (page) coordinates to world coordinates. */
  toWorld: (client: Point) => Point;
};

export const IDENTITY_VIEWPORT: CanvasViewport = {
  scale: 1,
  offset: { x: 0, y: 0 },
  toWorld: (client) => client,
};

/**
 * Builds one. Separate from the component so the conversion is testable and so
 * the identity fallback above and the real thing cannot drift apart.
 */
export function createCanvasViewport(
  view: Viewport,
  element: { current: HTMLElement | null },
): CanvasViewport {
  return {
    ...view,
    toWorld: (client) => {
      // Read through the ref at call time, not captured: the element is null
      // on the first render, and a viewport built then would convert against
      // an origin of (0, 0) for as long as the transform did not move.
      const bounds = element.current?.getBoundingClientRect();
      return toWorld(
        {
          x: client.x - (bounds?.left ?? 0),
          y: client.y - (bounds?.top ?? 0),
        },
        view,
      );
    },
  };
}

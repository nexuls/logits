"use client";

import { useEffect, useState } from "react";
import type { Side } from "./tour-steps";

/** A box in screen (viewport) coordinates — what `getBoundingClientRect` gives. */
export type ScreenRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

/** Gap between the spotlight and the card, and the card's margin from the window. */
const GAP = 16;
const MARGIN = 16;

const same = (a: ScreenRect, b: ScreenRect) =>
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.height === b.height;

/**
 * The element's on-screen box, inflated by `padding`, followed frame by frame.
 *
 * A polling loop rather than a `ResizeObserver` because the interesting moves
 * are the ones an observer on the target never sees: a sidebar animating its
 * width, the toolbar reflowing into its right-edge rail, the window resizing
 * an ancestor. It only runs while the tour is on screen — a modal overlay
 * where nothing else is happening — and `setState` is skipped whenever the box
 * has not actually moved, so a still target costs one comparison per frame.
 */
export function useTrackedRect(
  element: Element | null,
  padding = 0,
): ScreenRect | null {
  const [rect, setRect] = useState<ScreenRect | null>(null);

  useEffect(() => {
    if (!element) {
      setRect(null);
      return;
    }

    let frame = 0;
    const read = () => {
      const box = element.getBoundingClientRect();
      const next: ScreenRect = {
        top: box.top - padding,
        left: box.left - padding,
        width: box.width + padding * 2,
        height: box.height + padding * 2,
      };
      setRect((current) => (current && same(current, next) ? current : next));
      frame = requestAnimationFrame(read);
    };

    read();
    return () => cancelAnimationFrame(frame);
  }, [element, padding]);

  return rect;
}

/**
 * The window's inner size.
 *
 * The dimming is clipped to an explicit box of exactly these numbers. Reaching
 * for a box "big enough for any window" instead — a 9999px shadow spread, a
 * ±20000 clip path — is what every spotlight recipe does, and in Chromium it
 * silently paints nothing at all: the element computes correctly, has the
 * right box, and never appears.
 */
export function useWindowSize(): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const read = () =>
      setSize({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    return () => window.removeEventListener("resize", read);
  }, []);

  return size;
}

export type Placement = {
  top: number;
  left: number;
  side: Side;
  /** Where the arrow meets the card's edge, in pixels along that edge. */
  arrow: number;
  /**
   * The card fits beside the spotlight. When it does not — a spotlight the
   * size of the canvas leaves no room on any side — the card is centred over
   * it instead, and the arrow is left off because there is nothing to point
   * from.
   */
  fits: boolean;
};

const ORDER: readonly Side[] = ["bottom", "top", "right", "left"];

/** How much room the card would have on each side of the spotlight. */
function room(spot: ScreenRect, side: Side) {
  switch (side) {
    case "top":
      return spot.top - GAP - MARGIN;
    case "bottom":
      return window.innerHeight - (spot.top + spot.height) - GAP - MARGIN;
    case "left":
      return spot.left - GAP - MARGIN;
    case "right":
      return window.innerWidth - (spot.left + spot.width) - GAP - MARGIN;
    default:
      return 0;
  }
}

const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

/**
 * Puts the card beside the spotlight: the preferred side when it fits, else
 * the first side that does, else the roomiest one.
 *
 * The cross-axis position follows the spotlight's centre and is then clamped
 * into the window, which is why the arrow is returned separately — once the
 * card has been pushed away from centre the arrow still has to point at the
 * thing being explained.
 */
export function placeCard(
  spot: ScreenRect,
  card: { width: number; height: number },
  preferred: Side = "bottom",
): Placement {
  const needed = (side: Side) =>
    side === "top" || side === "bottom" ? card.height : card.width;

  const candidates = [preferred, ...ORDER.filter((s) => s !== preferred)];
  const side = candidates.find((s) => room(spot, s) >= needed(s));

  if (!side) {
    return {
      top: clamp(
        spot.top + spot.height / 2 - card.height / 2,
        MARGIN,
        Math.max(MARGIN, window.innerHeight - card.height - MARGIN),
      ),
      left: clamp(
        spot.left + spot.width / 2 - card.width / 2,
        MARGIN,
        Math.max(MARGIN, window.innerWidth - card.width - MARGIN),
      ),
      side: "bottom",
      arrow: 0,
      fits: false,
    };
  }

  const vertical = side === "top" || side === "bottom";
  const along = vertical
    ? clamp(
        spot.left + spot.width / 2 - card.width / 2,
        MARGIN,
        Math.max(MARGIN, window.innerWidth - card.width - MARGIN),
      )
    : clamp(
        spot.top + spot.height / 2 - card.height / 2,
        MARGIN,
        Math.max(MARGIN, window.innerHeight - card.height - MARGIN),
      );

  const across =
    side === "bottom"
      ? spot.top + spot.height + GAP
      : side === "top"
        ? spot.top - GAP - card.height
        : side === "right"
          ? spot.left + spot.width + GAP
          : spot.left - GAP - card.width;

  const centre = vertical
    ? spot.left + spot.width / 2
    : spot.top + spot.height / 2;
  const arrow = clamp(
    centre - along,
    20,
    (vertical ? card.width : card.height) - 20,
  );

  return vertical
    ? { top: across, left: along, side, arrow, fits: true }
    : { top: along, left: across, side, arrow, fits: true };
}

"use client";

import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, XIcon } from "lucide-react";
import { type RefObject, useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import {
  placeCard,
  type ScreenRect,
  useTrackedRect,
  useWindowSize,
} from "./spotlight";
import StepDots from "./step-dots";
import { TOUR_STEPS, type TourStep } from "./tour-steps";

type Props = {
  open: boolean;
  /**
   * The app shell. Targets are looked up inside it so a `CircuitPreview`
   * portalled into a dialog — which renders the same canvas, toolbar and
   * minimap — can never be picked up instead of the editor's own chrome.
   */
  rootRef: RefObject<HTMLElement | null>;
  onClose: () => void;
};

/** Card width, also what the placer measures against before the card exists. */
const CARD_WIDTH = 340;

/**
 * The post-welcome walkthrough: the app dimmed, one piece of chrome cut out of
 * the dim, and a card beside it saying what that piece does.
 *
 * The cut-out is a single element with an enormous spreading box-shadow rather
 * than four dimming panels or an SVG mask: one box to move means the reveal can
 * animate from step to step with a plain CSS transition, and a rounded cut-out
 * costs a `border-radius` instead of a mask path. The shadow does not take
 * pointer events, so a transparent sibling underneath is what actually holds
 * the app off while the tour is up.
 */
export default function GuidedTour({ open, rootRef, onClose }: Props) {
  const [steps, setSteps] = useState<{ step: TourStep; element: Element }[]>(
    [],
  );
  const [index, setIndex] = useState(0);
  const [card, setCard] = useState<HTMLDivElement | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const window_ = useWindowSize();

  // Resolved once per opening. A step whose chrome is not on screen is
  // dropped here rather than skipped later, so "3 of 5" counts what the user
  // can actually see and the dots do not jump over a gap.
  useEffect(() => {
    if (!open) return;

    const root = rootRef.current;
    if (!root) return;

    setSteps(
      TOUR_STEPS.flatMap((step) => {
        const element = root.querySelector(`[data-tour="${step.target}"]`);
        return element ? [{ step, element }] : [];
      }),
    );
    setIndex(0);
  }, [open, rootRef]);

  const total = steps.length;
  const current = steps[index];
  const spot = useTrackedRect(current?.element ?? null, current?.step.padding);

  const next = useCallback(() => {
    setIndex((at) => {
      if (at + 1 >= total) {
        onClose();
        return at;
      }
      return at + 1;
    });
  }, [onClose, total]);

  const back = useCallback(() => setIndex((at) => Math.max(0, at - 1)), []);

  // Measured rather than assumed: the bodies differ in length by enough lines
  // that a fixed height would leave the card floating off its target.
  useEffect(() => {
    if (!card) return;
    const read = () => setCardHeight(card.offsetHeight);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(card);
    return () => observer.disconnect();
  }, [card]);

  // Focus follows the step, so a screen reader reads each card as it opens and
  // Tab starts from the card rather than somewhere behind the dim. `index` is
  // the whole point of the dependency list: the card is one element reused
  // across every step, so nothing else here changes when the step does.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the step is the event.
  useEffect(() => {
    if (open && card) card.focus();
  }, [open, card, index]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        next();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        back();
      }

      // Every unmodified key is swallowed, not just the three above: the
      // editor's own shortcuts are single keys bound on `window`, so without
      // this, Space would start the simulation behind the dim and `R` would
      // rotate a selection nobody can see. Tab is let through because the card
      // handles it, and chords because those are the browser's.
      if (
        event.key !== "Tab" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        event.stopPropagation();
      }
    };

    // Capture, so the swallowing happens before the editor's own listener.
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, onClose, next, back]);

  if (!open || !current) return null;

  const placement = spot
    ? placeCard(
        spot,
        { width: CARD_WIDTH, height: cardHeight },
        current.step.side,
      )
    : null;
  const Icon = current.step.icon;

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {/* Holds the app off. Transparent: the dimming is the cut-out's shadow,
          which takes no pointer events of its own. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="End the tour"
        onClick={onClose}
        className="pointer-events-auto absolute inset-0 cursor-default outline-none"
      />

      {spot && (
        <Cutout
          rect={spot}
          radius={current.step.radius ?? 10}
          window={window_}
        />
      )}

      <div
        ref={setCard}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        tabIndex={-1}
        onKeyDown={(event) => {
          // A two-element trap: Tab off either end of the card comes back to
          // the other, so focus cannot wander into the dimmed app behind it.
          if (event.key !== "Tab") return;
          const focusable = card?.querySelectorAll<HTMLElement>(
            "button:not([tabindex='-1'])",
          );
          if (!focusable || focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        style={
          placement
            ? { top: placement.top, left: placement.left, width: CARD_WIDTH }
            : {
                top: "50%",
                left: "50%",
                width: CARD_WIDTH,
                transform: "translate(-50%, -50%)",
              }
        }
        className="pointer-events-auto absolute max-w-[calc(100vw-2rem)] rounded-2xl bg-popover p-5 text-popover-foreground shadow-2xl ring-1 ring-foreground/10 outline-none transition-[top,left] duration-300 ease-out"
      >
        {placement?.fits && <Arrow placement={placement} />}

        <div className="flex items-start gap-3">
          <span
            aria-hidden
            className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
          >
            <Icon className="size-4.5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              Step {index + 1} of {total}
            </p>
            <h2 id="tour-title" className="text-base font-semibold">
              {current.step.title}
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            aria-label="End the tour"
          >
            <XIcon />
          </Button>
        </div>

        <p
          id="tour-body"
          className="mt-3 text-sm leading-relaxed text-muted-foreground"
        >
          {current.step.body}
        </p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <StepDots
            count={total}
            index={index}
            label="tour step"
            onSelect={setIndex}
          />
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={back}
              disabled={index === 0}
            >
              <ArrowLeftIcon />
              Back
            </Button>
            <Button type="button" size="sm" onClick={next}>
              {index + 1 === total ? "Done" : "Next"}
              {index + 1 === total ? <CheckIcon /> : <ArrowRightIcon />}
            </Button>
          </div>
        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          <Kbd>←</Kbd> <Kbd>→</Kbd> to move · <Kbd>Esc</Kbd> to leave
        </p>
      </div>
    </div>
  );
}

/**
 * The hole in the dim: one full-screen wash with a rounded rectangle clipped
 * out of it, and a ring outlining the hole.
 *
 * `clip-path` with an even-odd path, rather than either of the two things that
 * look simpler and do not work here. A huge spreading `box-shadow` on the
 * spotlight computes correctly and then does not paint over the fixed chrome
 * it is meant to dim. An SVG `<mask>` paints nothing at all in this overlay.
 * A clipped `<div>` is an ordinary box that paints like every other one.
 *
 * Both halves of the path have the same segments whatever the step, so the
 * browser can interpolate between them and the reveal slides to its next
 * target instead of jumping.
 */
function Cutout({
  rect,
  radius,
  window: viewport,
}: {
  rect: ScreenRect;
  radius: number;
  /** The wash's own box, as explicit numbers — see `useWindowSize`. */
  window: { width: number; height: number };
}) {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  // A corner cannot be rounder than half the shorter side — and never zero:
  // a zero-radius arc makes Chromium reject the whole path, which clips the
  // wash away entirely rather than just squaring off the corner.
  const r = Math.max(0.5, Math.min(radius, width / 2, height / 2));

  const { left: x, top: y } = rect;
  // The window, then the hole: with `evenodd` the second subpath is what is
  // taken away from the first.
  const clip = [
    `M0 0 H${viewport.width} V${viewport.height} H0 Z`,
    `M${x + r} ${y}`,
    `H${x + width - r}`,
    `A${r} ${r} 0 0 1 ${x + width} ${y + r}`,
    `V${y + height - r}`,
    `A${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H${x + r}`,
    `A${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    `V${y + r}`,
    `A${r} ${r} 0 0 1 ${x + r} ${y}`,
    "Z",
  ].join(" ");

  return (
    <>
      <div
        aria-hidden
        style={{ clipPath: `path(evenodd, "${clip}")` }}
        className="pointer-events-none absolute inset-0 bg-black/60 transition-[clip-path] duration-300 ease-out"
      />
      <div
        aria-hidden
        style={{
          top: rect.top,
          left: rect.left,
          width,
          height,
          borderRadius: r,
        }}
        className="pointer-events-none absolute ring-2 ring-primary transition-all duration-300 ease-out"
      />
    </>
  );
}

/** The card's pointer: a rotated square tucked half under its edge. */
function Arrow({ placement }: { placement: ReturnType<typeof placeCard> }) {
  const vertical = placement.side === "top" || placement.side === "bottom";

  return (
    <span
      aria-hidden
      style={
        vertical
          ? {
              left: placement.arrow,
              [placement.side === "bottom" ? "top" : "bottom"]: -5,
            }
          : {
              top: placement.arrow,
              [placement.side === "right" ? "left" : "right"]: -5,
            }
      }
      className={cn(
        "absolute size-2.5 rotate-45 bg-popover",
        vertical ? "-translate-x-1/2" : "-translate-y-1/2",
      )}
    />
  );
}

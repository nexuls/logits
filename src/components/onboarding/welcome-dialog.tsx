"use client";

import { ArrowLeftIcon, ArrowRightIcon, CompassIcon } from "lucide-react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import StepDots from "./step-dots";
import { WELCOME_PAGES } from "./welcome-pages";

/** Constant, so the page navigation needs no reactive dependency on it. */
const TOTAL = WELCOME_PAGES.length;

type Props = {
  open: boolean;
  themeKey: string;
  /**
   * Closed for good — the button, Esc or a press outside. `tour` says whether
   * to follow it with the guided tour, which only the last page offers.
   */
  onClose: (options: { tour: boolean }) => void;
};

/**
 * The first-run welcome: a few pages of what the app is and how it is driven,
 * with the demonstrations running live rather than recorded.
 *
 * All pages are mounted at once on a sliding track, which is what makes the
 * movement between them continuous — an enter/exit animation on a single
 * mounted page cannot show both at the same time. What a mounted page costs is
 * bounded by the pages themselves: the live circuit previews check whether
 * they are the page on screen and draw a still of the same circuit when they
 * are not, so only one simulation ever runs.
 */
export default function WelcomeDialog({ open, themeKey, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);

  // Every opening starts at the first page — adjusted during render, so a
  // stale page never gets a frame on screen.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  const last = index === TOTAL - 1;
  const page = WELCOME_PAGES[index];

  const go = useCallback(
    (delta: number) =>
      setIndex((at) => Math.min(TOTAL - 1, Math.max(0, at + delta))),
    [],
  );

  // Arrow keys move between pages, but not while the pointer is inside a live
  // demo: the previews are operable, and a circuit that takes keyboard input
  // would lose it to the carousel.
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea")
    ) {
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
    }
  };

  // The page that slid out of view keeps whatever focus it had, which would
  // let Tab walk into an off-screen page. Sending focus to the track resets it
  // to the start of the page now on screen, which is why the page index is in
  // the dependency list although the element it focuses never changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the page is the event.
  useEffect(() => {
    if (open) trackRef.current?.focus({ preventScroll: true });
  }, [open, index]);

  return (
    <Dialog
      open={open}
      // Esc and a press outside are the same as Skip: gone, and the tour is
      // not started behind a dialog the user has just dismissed.
      onOpenChange={(next) => {
        if (!next) onClose({ tour: false });
      }}
    >
      <DialogContent
        onKeyDown={onKeyDown}
        className="gap-0 overflow-hidden p-0 sm:max-w-4xl"
      >
        {/* The page's own heading is in its layout, where it belongs beside
            the illustration. This pair is what names the dialog for assistive
            technology, and it changes with the page. */}
        <DialogTitle className="sr-only">{page.title}</DialogTitle>
        <DialogDescription className="sr-only">
          {page.description} Page {index + 1} of {TOTAL}.
        </DialogDescription>

        <div
          ref={trackRef}
          tabIndex={-1}
          className="relative h-[clamp(20rem,64svh,32rem)] overflow-hidden outline-none"
        >
          <div
            className="flex h-full transition-transform duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            {WELCOME_PAGES.map(({ id, Content }, at) => (
              <section
                key={id}
                aria-hidden={at !== index}
                // Off-screen pages are kept out of the tab order entirely, so
                // the two-element focus reset above is all the trap needed.
                inert={at !== index}
                className="h-full w-full shrink-0"
              >
                <Content active={open && at === index} themeKey={themeKey} />
              </section>
            ))}
          </div>

          {/* A hairline under the pages, so a demo that reaches the bottom of
              its pane does not bleed into the footer. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-linear-to-t from-popover to-transparent"
          />
        </div>

        <footer className="flex items-center gap-3 border-t border-border bg-popover px-5 py-3.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => go(-1)}
            disabled={index === 0}
            className={cn(index === 0 && "invisible")}
          >
            <ArrowLeftIcon />
            Back
          </Button>

          <StepDots
            count={TOTAL}
            index={index}
            label="page"
            onSelect={setIndex}
            className="mx-auto"
          />

          {last ? (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClose({ tour: false })}
              >
                Start building
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => onClose({ tour: true })}
              >
                <CompassIcon />
                Show me around
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onClose({ tour: false })}
              >
                Skip
              </Button>
              <Button type="button" size="sm" onClick={() => go(1)}>
                Next
                <ArrowRightIcon />
              </Button>
            </div>
          )}
        </footer>
      </DialogContent>
    </Dialog>
  );
}

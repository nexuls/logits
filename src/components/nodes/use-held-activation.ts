"use client";

import { type KeyboardEvent, useCallback, useEffect, useRef } from "react";

/**
 * Keyboard handlers for a momentary control — a button, a keypad key — that
 * give the key an actual *held* phase.
 *
 * A native `<button>` activates on `click`: Enter on keydown, Space on keyup.
 * A click is a press and a release inside one tick, so the two `setParams`
 * writes coalesce and the simulation never sees the pin high — not even a
 * `time.oneshot` watching for the edge. Pointer presses work because they are
 * held across frames; this is what makes the keyboard path match, which the
 * accessibility rule in AGENTS.md requires.
 *
 * So the default activation is suppressed and `keydown` / `keyup` drive the
 * two phases directly. A `click` that arrives anyway was synthesised — by a
 * screen reader, or by `element.click()` — and has no phases to take, so it
 * gets a pulse released on the next frame: the shortest hold the simulation
 * can still observe, and the same thing a very quick tap produces.
 */

/** The two keys a native button activates on. */
const ACTIVATION_KEYS = new Set([" ", "Enter"]);

/**
 * `T` is what identifies the thing being pressed — nothing for a button, the
 * key index for a keypad. One hook per control, not per key: only one key can
 * be down at a time, which is what `pressed` already records.
 */
export type HeldActivation<T> = {
  onKeyDown: (event: KeyboardEvent<HTMLElement>, target: T) => void;
  onKeyUp: (event: KeyboardEvent<HTMLElement>) => void;
  onBlur: () => void;
  /** Runs `press` now and `release` on the next frame. */
  pulse: (target: T) => void;
};

export function useHeldActivation<T = void>(
  press: (target: T) => void,
  release: () => void,
): HeldActivation<T> {
  // Read through refs so the returned handlers stay stable while `press` and
  // `release` close over fresh params on every render.
  const latest = useRef({ press, release });
  latest.current = { press, release };

  const held = useRef(false);
  const frame = useRef<number | null>(null);

  const endPulse = useCallback(() => {
    if (frame.current === null) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  // A control unmounted mid-press — deleted, or scrolled out of a rebuilt
  // layer — must not leave its pin asserted with nothing able to let go.
  useEffect(
    () => () => {
      endPulse();
      if (held.current) latest.current.release();
    },
    [endPulse],
  );

  const doRelease = useCallback(() => {
    if (!held.current) return;
    held.current = false;
    latest.current.release();
  }, []);

  return {
    onKeyDown: useCallback((event: KeyboardEvent<HTMLElement>, target: T) => {
      if (!ACTIVATION_KEYS.has(event.key)) return;
      // Before the repeat check: the default has to be suppressed on every
      // repeat, or holding Enter fires a click per repetition.
      event.preventDefault();
      if (event.repeat || held.current) return;
      held.current = true;
      latest.current.press(target);
    }, []),

    onKeyUp: useCallback(
      (event: KeyboardEvent<HTMLElement>) => {
        if (!ACTIVATION_KEYS.has(event.key)) return;
        event.preventDefault();
        doRelease();
      },
      [doRelease],
    ),

    // Tabbing away while holding the key never delivers the keyup.
    onBlur: doRelease,

    pulse: useCallback(
      (target: T) => {
        if (held.current) return;
        held.current = true;
        latest.current.press(target);
        endPulse();
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          held.current = false;
          latest.current.release();
        });
      },
      [endPulse],
    ),
  };
}

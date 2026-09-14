"use client";

import { KeyboardIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { boolParam } from "@/lib/nodes/define";
import { EVENT_LOG, keyEvents, lastSeqOf } from "@/lib/nodes/io/keyboard";
import {
  exitChordLabel,
  exitChordOf,
  isExitChord,
  type KeyEvent,
} from "@/lib/nodes/io/keyboard-codes";
import { cn } from "@/lib/utils";
import type { NodeViewProps } from "./node-views";

/**
 * A keyboard the user types into.
 *
 * Capture is a mode of this view, not of the editor: while it is on, the face
 * holds focus and its own listeners stop every key before it bubbles to the
 * window, where the editor's shortcuts and the canvas's space-to-pan listen.
 * That is what lets the element take `Space`, `Delete` and `Ctrl+Z` as data
 * without the editor learning that a keyboard node exists (Non-negotiable #4).
 * The exit chord is the one key it gives back — the keyboard path out of a
 * mode that otherwise swallows `Tab` too.
 *
 * Keys go into the `events` log through `setParams`, so they reach the engine
 * the way a switch flip does. Every event after the first in a session
 * coalesces into one undo step: `Ctrl+Z` after typing a line should take back
 * the line, not its last letter.
 */
export default function KeyboardView({
  node,
  setParams,
  readPin,
  interactive,
}: NodeViewProps) {
  const [capturing, setCapturing] = useState(false);
  const surface = useRef<HTMLButtonElement>(null);

  const exitChord = exitChordOf(node.params.exitKey);
  const log = keyEvents(node.params);

  // Read inside window listeners installed once per session, so they see the
  // current params without being torn down on every keystroke's re-render.
  const latest = useRef({ params: node.params, setParams });
  latest.current = { params: node.params, setParams };

  // A sequence number only has to beat every one this node ever logged. The
  // log can be shortened by an undo, so its tail is not enough on its own;
  // wall-clock time seeds the counter so a remounted view still numbers past
  // what an earlier mount logged. Time is fine here — it is only an ordering
  // key, and the engine never reads a clock.
  const nextSeq = useRef(0);

  useEffect(() => {
    if (!capturing) return;
    const element = surface.current;
    if (!element) return;

    let active = true;
    let firstInSession = true;
    // Keys pressed while capturing, so a release is only ever logged for a
    // press the circuit saw, and capture ending can release what is held.
    const held = new Map<string, string>();
    // The log as this session last wrote it: two keys can land before React
    // re-renders with the params the first one produced.
    let pending: KeyEvent[] | null = null;

    const record = (entries: Omit<KeyEvent, "seq">[]) => {
      if (entries.length === 0) return;
      const { params, setParams } = latest.current;
      const committed = keyEvents(params);
      const base =
        pending && lastSeqOf(pending) >= lastSeqOf(committed)
          ? pending
          : committed;

      let seq = Math.max(nextSeq.current, lastSeqOf(base), Date.now() - 1);
      const next = [
        ...base,
        ...entries.map((entry) => ({ ...entry, seq: ++seq })),
      ].slice(-EVENT_LOG);
      nextSeq.current = seq;
      pending = next;

      setParams({ events: next }, { coalesce: !firstInSession });
      firstInSession = false;
    };

    const stop = () => {
      if (!active) return;
      active = false;
      if (boolParam(latest.current.params, "releases", false)) {
        record([...held].map(([code, key]) => ({ code, key, up: true })));
      }
      held.clear();
      setCapturing(false);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      if (isExitChord(exitChordOf(latest.current.params.exitKey), event)) {
        stop();
        return;
      }
      if (event.repeat && !boolParam(latest.current.params, "repeat", true)) {
        return;
      }

      held.set(event.code, event.key);
      record([{ code: event.code, key: event.key, ctrl: event.ctrlKey }]);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const key = held.get(event.code);
      if (key === undefined) return;
      held.delete(event.code);
      if (boolParam(latest.current.params, "releases", false)) {
        record([{ code: event.code, key: event.key || key, up: true }]);
      }
    };

    // A press anywhere else ends capture even when it does not move focus —
    // the canvas takes pointer events without being focusable.
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !element.contains(event.target)) {
        stop();
      }
    };

    element.addEventListener("keydown", onKeyDown);
    element.addEventListener("keyup", onKeyUp);
    element.addEventListener("blur", stop);
    window.addEventListener("blur", stop);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });
    element.focus();

    return () => {
      active = false;
      element.removeEventListener("keydown", onKeyDown);
      element.removeEventListener("keyup", onKeyUp);
      element.removeEventListener("blur", stop);
      window.removeEventListener("blur", stop);
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, [capturing]);

  useEffect(() => {
    if (!interactive) setCapturing(false);
  }, [interactive]);

  const start = () => {
    if (!interactive || capturing) return;
    nextSeq.current = Math.max(nextSeq.current, Date.now());
    setCapturing(true);
  };

  const recent = log
    .filter((event) => !event.up)
    .slice(-8)
    .map((event) => keyGlyph(event.key));
  const data = readPin("data");
  const valid = readPin("valid");
  const exitLabel = exitChordLabel(exitChord);

  return (
    <button
      ref={surface}
      type="button"
      disabled={!interactive}
      onPointerDown={(event) => {
        // The body is draggable; an interactive part takes the pointer back.
        event.stopPropagation();
      }}
      onClick={start}
      // Not yet capturing, Space and Enter arm the element. Stopped here so
      // the same key does not also reach the editor's play/pause tap.
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") event.stopPropagation();
      }}
      aria-pressed={capturing}
      aria-label={
        capturing
          ? `${node.label ?? "Keyboard"}: capturing keys. Press ${exitLabel} to stop.`
          : `${node.label ?? "Keyboard"}: press to type into the circuit`
      }
      className={cn(
        "flex h-full w-full flex-col justify-between gap-0.5 rounded-sm border p-1 text-left",
        "font-mono text-[8px] leading-tight outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring",
        interactive ? "cursor-text" : "cursor-default",
        capturing
          ? "border-primary bg-primary/10 ring-2 ring-primary/40"
          : "border-border bg-muted",
      )}
    >
      <span className="flex items-center gap-1 font-sans font-medium text-foreground">
        <KeyboardIcon aria-hidden className="size-2.5 shrink-0" />
        <span className="truncate">
          {capturing ? "Typing" : "Click to type"}
        </span>
        {capturing && (
          // A shape as well as the ring colour, so the mode is not told by
          // colour alone.
          <span
            aria-hidden
            className="ml-auto h-2 w-px bg-primary motion-safe:animate-pulse"
          />
        )}
      </span>

      <span
        aria-hidden
        className="min-h-0 truncate rounded-xs bg-card px-0.5 text-foreground"
      >
        {recent.length > 0 ? recent.join(" ") : " "}
      </span>

      <span className="flex items-center justify-between gap-1 text-muted-foreground">
        {capturing ? (
          <span className="truncate">{exitLabel} to exit</span>
        ) : (
          <>
            <span className="truncate">D {hexOf(data)}</span>
            <span className="truncate">{valid === "1" ? "VLD" : "—"}</span>
          </>
        )}
      </span>
    </button>
  );
}

const GLYPHS: Record<string, string> = {
  Enter: "⏎",
  Backspace: "⌫",
  Tab: "⇥",
  " ": "␣",
  Escape: "⎋",
  Delete: "⌦",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Shift: "⇧",
  Control: "⌃",
  Alt: "⌥",
  Meta: "⌘",
};

function keyGlyph(key: string): string {
  return GLYPHS[key] ?? (key.length <= 3 ? key : key.slice(0, 3));
}

/** An 8-bit MSB-first pin value as two hex digits, or `?` for an unknown. */
function hexOf(bits: string): string {
  if (bits.length === 0) return "--";
  if (!/^[01]+$/.test(bits)) return bits.includes("X") ? "XX" : "ZZ";
  return Number.parseInt(bits, 2).toString(16).toUpperCase().padStart(2, "0");
}

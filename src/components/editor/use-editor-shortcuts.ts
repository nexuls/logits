"use client";

import { useEffect, useRef } from "react";
import type { Fragment } from "@/lib/circuit/commands";
import { GRID_SIZE } from "@/lib/circuit/geometry";
import type { Point } from "@/lib/circuit/schema";
import {
  copySelection,
  deleteSelection,
  duplicateSelection,
  flushSave,
  pasteFragment,
  redo,
  rotateSelection,
  undo,
} from "@/state/document";
import { clearSelection, getSelection, selectOnly } from "@/state/selection";
import { stepSimulation, togglePlay } from "@/state/simulation";

/**
 * Keyboard shortcuts for the editor, per artifacts/07-interaction-spec.md.
 *
 * Bound on `window` rather than on the canvas, because the toolbar, palette
 * and inspector are all outside it and `Ctrl+Z` has to work wherever focus
 * happens to be. Every plain-letter binding is guarded against text inputs
 * with the same `isEditableTarget` test the canvas uses — reusing it rather
 * than growing a second one that drifts.
 */

/** How far a duplicate lands from its original, so both are visible. */
const DUPLICATE_OFFSET: Point = { x: GRID_SIZE * 2, y: GRID_SIZE * 2 };

/**
 * A space held longer than this is the pan gesture, not the play/pause tap.
 * The two share a key by design (the interaction spec lists both), so the tap
 * is defined as a short press during which no pointer went down.
 */
const SPACE_TAP_MS = 400;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

type Options = {
  /** Where the pointer last was, for pasting at the cursor. */
  pointerWorld: () => Point;
  onCommandMenu: () => void;
  /** Esc: cancels a wire in progress before it clears the selection. */
  onEscape: () => boolean;
  onNotice: (message: string) => void;
};

export function useEditorShortcuts({
  pointerWorld,
  onCommandMenu,
  onEscape,
  onNotice,
}: Options) {
  // The clipboard is a document fragment, not a list of ids, so it survives
  // deleting what was copied and pasting into another circuit.
  const clipboard = useRef<Fragment | null>(null);

  // Refs rather than state: these are read inside a window listener that is
  // installed once, and none of them should cause a render.
  const handlers = useRef({ pointerWorld, onCommandMenu, onEscape, onNotice });
  handlers.current = { pointerWorld, onCommandMenu, onEscape, onNotice };

  useEffect(() => {
    const spaceDown = { at: 0, pointerUsed: false };

    const onPointerDown = () => {
      spaceDown.pointerUsed = true;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const editable = isEditableTarget(event.target);
      const accel = event.ctrlKey || event.metaKey;

      if (event.code === "Space" && !editable && !event.repeat) {
        spaceDown.at = event.timeStamp;
        spaceDown.pointerUsed = false;
        return;
      }

      if (event.key === "Escape") {
        // The wire in progress goes first: Esc while wiring cancels the wire,
        // and only a second Esc clears the selection.
        if (!handlers.current.onEscape()) clearSelection();
        return;
      }

      if (accel && event.key.toLowerCase() === "k") {
        event.preventDefault();
        handlers.current.onCommandMenu();
        return;
      }

      if (editable) return;

      if (accel) {
        switch (event.key.toLowerCase()) {
          case "z":
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
            return;
          case "y":
            event.preventDefault();
            redo();
            return;
          case "s":
            // The document autosaves anyway; Ctrl+S makes that immediate and,
            // more importantly, stops the browser opening a save dialog over
            // the canvas.
            event.preventDefault();
            flushSave();
            handlers.current.onNotice("Saved.");
            return;
          case "d": {
            event.preventDefault();
            const pasted = duplicateSelection(getSelection(), DUPLICATE_OFFSET);
            if (pasted) selectOnly(pasted.nodeIds, pasted.wireIds);
            return;
          }
          case "c":
            clipboard.current = copySelection(getSelection());
            return;
          case "x": {
            const selection = getSelection();
            clipboard.current = copySelection(selection);
            if (clipboard.current) deleteSelection(selection);
            return;
          }
          case "v": {
            if (!clipboard.current) return;
            event.preventDefault();

            // Pasted at the pointer, which means offsetting the fragment from
            // wherever it was copied — the first node's corner is the anchor.
            const anchor = clipboard.current.nodes[0]?.position ?? {
              x: 0,
              y: 0,
            };
            const target = handlers.current.pointerWorld();
            const pasted = pasteFragment(clipboard.current, {
              x: target.x - anchor.x,
              y: target.y - anchor.y,
            });
            if (pasted) selectOnly(pasted.nodeIds, pasted.wireIds);
            return;
          }
          case "a":
            // Nothing to intercept here yet: select-all lives on the canvas in
            // phase 5, and stealing the key now would break text selection.
            return;
          default:
            return;
        }
      }

      switch (event.key) {
        case "Delete":
        case "Backspace": {
          const selection = getSelection();
          if (selection.nodeIds.length + selection.wireIds.length === 0) return;
          event.preventDefault();
          deleteSelection(selection);
          clearSelection();
          return;
        }
        case "r":
        case "R": {
          const selection = getSelection();
          if (selection.nodeIds.length === 0) return;
          event.preventDefault();
          rotateSelection(selection.nodeIds, event.shiftKey ? -1 : 1);
          return;
        }
        case ".":
          event.preventDefault();
          stepSimulation();
          return;
        default:
          return;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isEditableTarget(event.target)) return;

      const held = event.timeStamp - spaceDown.at;
      if (!spaceDown.pointerUsed && held < SPACE_TAP_MS) togglePlay();

      spaceDown.at = 0;
      spaceDown.pointerUsed = false;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("pointerdown", onPointerDown, { capture: true });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("pointerdown", onPointerDown, {
        capture: true,
      });
    };
  }, []);
}

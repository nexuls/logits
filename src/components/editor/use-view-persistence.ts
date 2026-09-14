"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import type { Viewport } from "@/lib/circuit/coords";
import { readViewport, writeViewport } from "@/state/storage";

/**
 * Remembers where each circuit was last left, per browser.
 *
 * Same debounce-and-flush shape as the document autosave in `document.ts`, and
 * for the same reason: a pan writes the transform on every pointer move, and
 * `localStorage` is synchronous. The last one still has to land, so the timer
 * is flushed when the document is swapped, when the editor unmounts, and on
 * `beforeunload`.
 */

const SAVE_DELAY_MS = 400;

type Pending = { id: string; view: Viewport };

export function useViewPersistence(documentId: string | null, enabled = true) {
  /**
   * Read once per document rather than in an effect: the canvas needs the
   * restored transform in the same render that `viewKey` changes, or it frames
   * on the default first and jumps a frame later.
   */
  const restoredView = useMemo(
    () => (documentId && enabled ? readViewport(documentId) : null),
    [documentId, enabled],
  );

  const pendingRef = useRef<Pending | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending) writeViewport(pending.id, pending.view);
  }, []);

  const saveView = useCallback(
    (view: Viewport) => {
      if (!documentId || !enabled) return;

      // A queued write for another circuit belongs to that circuit; land it
      // before this one starts overwriting the timer.
      if (pendingRef.current && pendingRef.current.id !== documentId) flush();

      pendingRef.current = { id: documentId, view };
      if (timerRef.current !== null) return;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        flush();
      }, SAVE_DELAY_MS);
    },
    [documentId, enabled, flush],
  );

  useEffect(() => {
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flush]);

  return { restoredView, saveView };
}

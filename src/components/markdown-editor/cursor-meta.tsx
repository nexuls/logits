"use client";

/**
 * Shared cursor-meta store used by the editor view and the workspace footer.
 *
 * Cursor position changes are extremely high-frequency, so we keep them in a
 * mutable ref instead of React state — only consumers that genuinely need to
 * re-render (the editor view itself) subscribe with their own state. The
 * holder reads `read(tabId)` lazily when switching tabs to populate the
 * footer with the last-known cursor for the newly active tab, including for
 * tabs whose editor component has unmounted.
 */

import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";

import { DEFAULT_CURSOR_META, type CursorMeta } from "./editor";

type CursorMetaStore = {
  /** Raw map keyed by tab id. Exposed for callers that need imperative reads. */
  ref: RefObject<Record<string, CursorMeta>>;
  /** Returns {@link DEFAULT_CURSOR_META} when the tab has no recorded meta yet. */
  read: (tabId: string) => CursorMeta;
  /** Overwrites the meta for `tabId`. */
  write: (tabId: string, meta: CursorMeta) => void;
};

const CursorMetaContext = createContext<CursorMetaStore | null>(null);

export function CursorMetaProvider({ children }: { children: ReactNode }) {
  const ref = useRef<Record<string, CursorMeta>>({});

  const value = useMemo<CursorMetaStore>(
    () => ({
      ref,
      read: (tabId) => ref.current[tabId] ?? DEFAULT_CURSOR_META,
      write: (tabId, meta) => {
        ref.current[tabId] = meta;
      },
    }),
    [],
  );

  return (
    <CursorMetaContext.Provider value={value}>
      {children}
    </CursorMetaContext.Provider>
  );
}

export function useCursorMetaStore() {
  const ctx = useContext(CursorMetaContext);
  if (!ctx) {
    throw new Error(
      "useCursorMetaStore must be used inside CursorMetaProvider",
    );
  }
  return ctx;
}

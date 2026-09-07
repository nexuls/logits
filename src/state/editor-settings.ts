"use client";

import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { z } from "zod";

/**
 * Editor preferences — how the workspace looks, not what the circuit is.
 *
 * Deliberately separate from the document: none of this is saved with a
 * circuit or shared with anyone opening it. Same external-store shape as
 * `projects-store.ts`, for the same reason — `localStorage` has no change
 * notification, so every write goes through here and invalidates the snapshot.
 */

export const SETTINGS_KEY = "logits:settings";

const settingsSchema = z.object({
  theme: z.literal(["dark", "light"]),
  showGrid: z.boolean(),
  showMinimap: z.boolean(),
});

export type EditorSettings = z.infer<typeof settingsSchema>;

/**
 * The server snapshot too, so the first paint matches `layout.tsx`, which
 * hardcodes `dark` on `<html>`. A stored `light` is applied on hydration.
 */
const DEFAULTS: EditorSettings = {
  theme: "dark",
  showGrid: true,
  showMinimap: true,
};

/** `useLayoutEffect` warns when it runs during SSR, where there is no layout. */
const useIsomorphicLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

const listeners = new Set<() => void>();

/** Cached so `getSnapshot` returns a stable reference between writes. */
let snapshot: EditorSettings | null = null;

function storage(): Storage | null {
  // Private-mode Safari throws on access, not just on write.
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(): EditorSettings {
  const store = storage();
  if (!store) return DEFAULTS;

  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULTS;

    // Partial so a settings file written by an older build keeps the keys it
    // has and picks up defaults for the rest, rather than being thrown away.
    const parsed = settingsSchema.partial().safeParse(JSON.parse(raw));
    return parsed.success ? { ...DEFAULTS, ...parsed.data } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

function onStorageEvent(event: StorageEvent) {
  // Fires only for *other* tabs, which is exactly what local writes miss.
  if (event.key === null || event.key === SETTINGS_KEY) {
    snapshot = null;
    for (const listener of listeners) listener();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorageEvent);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

function getSnapshot(): EditorSettings {
  snapshot ??= read();
  return snapshot;
}

function getServerSnapshot(): EditorSettings {
  return DEFAULTS;
}

export function useEditorSettings(): EditorSettings {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * Writes one setting. A refusal from storage is not reported: losing a
 * preference is not worth an error banner, and the change still applies for
 * this session.
 */
export function setEditorSetting<K extends keyof EditorSettings>(
  key: K,
  value: EditorSettings[K],
): void {
  const next = { ...getSnapshot(), [key]: value };
  snapshot = next;

  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // Quota or a blocked store — the in-memory snapshot is still correct.
  }

  for (const listener of listeners) listener();
}

/**
 * Applies the stored theme to `<html>`.
 *
 * `layout.tsx` renders the `dark` class, so a stored `light` only takes effect
 * on hydration — a one-frame flash, traded against inlining a blocking script
 * in the document head. Call it once, from a component that is always mounted:
 * the settings panel unmounts with the mobile sidebar sheet.
 *
 * A layout effect, not a passive one: children that sample theme colours
 * imperatively (the minimap paints to a `<canvas>`) run their effects before
 * this component's, and would read the outgoing palette.
 */
export function useAppliedTheme(): EditorSettings["theme"] {
  const { theme } = useEditorSettings();

  useIsomorphicLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  return theme;
}

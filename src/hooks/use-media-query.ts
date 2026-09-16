"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a CSS media query.
 *
 * `useSyncExternalStore` rather than state in an effect so the first client
 * render already has the answer — a component that only exists when the query
 * matches (the device warning) would otherwise mount, paint, and correct
 * itself a frame later.
 *
 * The server snapshot is `false`: there is no viewport to measure during SSR,
 * so nothing gated on a query is rendered until hydration.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

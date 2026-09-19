"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Which project is open, kept in the URL as `?p=<id>`.
 *
 * It lived in React state, so a reload always landed on whichever project
 * happened to sort first and there was no link to a particular one. The id is
 * enough on its own: a project is a row in this browser's storage, so the URL
 * addresses it for this browser the same way a file path does on a disk.
 *
 * Shallow routing through `history.pushState` / `replaceState`, which Next
 * integrates with its own router — see
 * `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`.
 * Not `useSearchParams`: reading it from a prerendered route would push the
 * whole client tree behind a Suspense boundary to no benefit, since the page
 * cannot show anything until storage has been read after hydration anyway.
 *
 * Picking a project pushes, so Back returns to the previous one. Resolving the
 * opening project replaces, so Back leaves the app rather than cycling through
 * ids the user never chose.
 */

export const PROJECT_PARAM = "p";

/** The id in the current URL, or "" — safe before hydration. */
function idFromLocation(): string {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(PROJECT_PARAM) ?? "";
}

function writeLocation(id: string, mode: "push" | "replace") {
  const params = new URLSearchParams(window.location.search);
  if (id) params.set(PROJECT_PARAM, id);
  else params.delete(PROJECT_PARAM);

  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  if (mode === "push") window.history.pushState(null, "", url);
  else window.history.replaceState(null, "", url);
}

export type ProjectRoute = {
  /** "" until the first effect runs, so the server and client agree. */
  activeId: string;
  /**
   * False until that first effect has read the URL. Nothing may decide which
   * project to open before it flips, because `activeId` is still empty and
   * deciding would `replaceState` the id straight out of the link.
   */
  ready: boolean;
  /** The user chose this project: a history entry, so Back undoes it. */
  select: (id: string) => void;
  /**
   * The app decided this project — the list hydrated, or the open one was
   * deleted. No history entry; it rewrites where the user already is.
   */
  settle: (id: string) => void;
};

export function useProjectRoute(): ProjectRoute {
  // Empty on the first render even when the URL has an id, because the server
  // rendered it empty and a mismatch here would be a hydration error.
  const [activeId, setActiveId] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActiveId(idFromLocation());
    setReady(true);

    // Back and forward move between projects, so the app has to follow.
    const onPopState = () => setActiveId(idFromLocation());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // Compared against the URL rather than against state: it keeps the history
  // write out of the state updater, which React may run twice, and it needs no
  // dependency on the current id to stay correct.
  const go = useCallback((id: string, mode: "push" | "replace") => {
    if (idFromLocation() !== id) writeLocation(id, mode);
    setActiveId(id);
  }, []);

  return {
    activeId,
    ready,
    select: useCallback((id: string) => go(id, "push"), [go]),
    settle: useCallback((id: string) => go(id, "replace"), [go]),
  };
}

"use client";

import { useEffect } from "react";

import { isEditableTarget } from "@/components/editor/use-editor-shortcuts";

/**
 * Keeps the browser's own context menu off the app. Its "Back", "Save as" and
 * "Inspect" have nothing to do with a circuit, and on chrome that is not
 * selectable the menu is all it offers.
 *
 * It only calls `preventDefault` and never stops propagation, so the places
 * that give right-click a meaning — the canvas's wire branch, the palette's
 * "one fewer", the sidebar's project menu — still receive the event. Editable
 * fields keep the native menu: it is where paste and spell-check live.
 */
export default function NativeMenuGuard() {
  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (!isEditableTarget(event.target)) event.preventDefault();
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, []);

  return null;
}

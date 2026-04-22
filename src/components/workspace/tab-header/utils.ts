import { FileIcon, FileImageIcon, FilePenLineIcon } from "lucide-react";
import type { FileType } from "@/data/modules/notebook/client-types";

/**
 * Maps a notebook file type to the icon rendered on its tab.
 * Pure function so icon resolution is deterministic and easy to test.
 */
export function getTabIcon(type: FileType) {
  if (type === "image") return FileImageIcon;
  if (type === "draw") return FilePenLineIcon;
  return FileIcon;
}

/**
 * Strict order comparison: treats same-ids-different-sequence as not
 * equal. Used by the reorder hook to decide whether to commit a change.
 */
export function areOrdersEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;
  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }
  return true;
}

/**
 * Move a single tab inside an ordered list without mutating the input.
 * Returns the same array reference when the source index is invalid.
 */
export function moveTab(tabIds: string[], from: number, to: number) {
  const nextTabIds = [...tabIds];
  const [movedTabId] = nextTabIds.splice(from, 1);
  if (!movedTabId) return tabIds;
  nextTabIds.splice(to, 0, movedTabId);
  return nextTabIds;
}

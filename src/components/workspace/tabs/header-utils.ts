import { FileIcon, FileImageIcon, FilePenLineIcon } from "lucide-react";
import type { FileType } from "@/data/modules/notebook/client-types";

/**
 * Maps notebook file types to the icon component used in the tab header.
 * Constraint: keep this function pure so icon resolution remains deterministic
 * and easy to test.
 */
export function getTabIcon(type: FileType) {
  if (type === "image") return FileImageIcon;
  if (type === "draw") return FilePenLineIcon;
  return FileIcon;
}

/**
 * Compares two tab ID orders with index-level equality.
 * Constraint: this treats order as significant; same IDs in a different
 * sequence are considered different by design.
 */
export function areOrdersEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}

/**
 * Returns a new tab order after moving one tab from `from` to `to`.
 * Constraints:
 * 1. Never mutate the incoming `tabIds` array.
 * 2. Preserve all original IDs.
 * 3. If source index is invalid, return the original array reference.
 */
export function moveTab(tabIds: string[], from: number, to: number) {
  const nextTabIds = [...tabIds];
  const [movedTabId] = nextTabIds.splice(from, 1);

  if (!movedTabId) return tabIds;

  nextTabIds.splice(to, 0, movedTabId);
  return nextTabIds;
}

import { FileIcon, FileImageIcon, FilePenLineIcon } from "lucide-react";
import type { FileType } from "@/data/modules/notebook/client-types";

export function getTabIcon(type: FileType) {
  if (type === "image") return FileImageIcon;
  if (type === "draw") return FilePenLineIcon;
  return FileIcon;
}

export function areOrdersEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}

export function moveTab(tabIds: string[], from: number, to: number) {
  const nextTabIds = [...tabIds];
  const [movedTabId] = nextTabIds.splice(from, 1);

  if (!movedTabId) return tabIds;

  nextTabIds.splice(to, 0, movedTabId);
  return nextTabIds;
}

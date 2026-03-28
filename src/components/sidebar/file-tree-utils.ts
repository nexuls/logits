import {
  FileImage,
  FilePenLine,
  FileText,
  Folder,
  type LucideIcon,
} from "lucide-react";
import type { T_File, T_File_Type } from "@/types/types";

export type FileTreeDropPosition = "before" | "inside" | "after";

export function sortChildren(files: T_File[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder) {
      return first.metadata.fileOrder - second.metadata.fileOrder;
    }

    if (first.metadata.type === "folder" && second.metadata.type !== "folder") {
      return -1;
    }

    if (first.metadata.type !== "folder" && second.metadata.type === "folder") {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });
}

export function getFileIcon(type: T_File_Type): LucideIcon {
  if (type === "folder") {
    return Folder;
  }

  if (type === "draw") {
    return FilePenLine;
  }

  if (type === "image") {
    return FileImage;
  }

  return FileText;
}

export function getDescendantIds(files: T_File[], rootId: string) {
  const ids = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const parentId = stack.pop();

    if (!parentId) {
      continue;
    }

    for (const file of files) {
      if (file.metadata.parentId !== parentId || ids.has(file.id)) {
        continue;
      }

      ids.add(file.id);
      stack.push(file.id);
    }
  }

  return ids;
}

export function getTreeDropPosition(
  clientY: number,
  rect: DOMRect,
  isFolder: boolean,
): FileTreeDropPosition {
  const offsetY = clientY - rect.top;
  const threshold = rect.height * 0.28;

  if (offsetY < threshold) {
    return "before";
  }

  if (offsetY > rect.height - threshold) {
    return "after";
  }

  return isFolder ? "inside" : "after";
}

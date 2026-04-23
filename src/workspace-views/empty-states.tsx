/**
 * Shared empty / unsupported-state UI for workspace views.
 *
 * Two layers live here:
 *   - `NotebookEmptyState` — the visual shell, used both inside view bodies
 *     (via `host.tsx`) and as the workspace-level empty state.
 *   - File-type fallbacks (`getTextFileUnsupportedState`) and the
 *     workspace-level fallback selector (`renderEmptyState`), which both the
 *     editor and preview views share since they accept the same file types.
 */

import {
  FileImage,
  FilePenLine,
  FolderClosed,
  NotebookText,
} from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import type { AppFile } from "@/data/modules/notebook/client-types";

import type { ViewUnsupportedState } from "./types";

/**
 * Fallback for views that only handle text files. Returns `null` for `"file"`
 * (the supported case) so callers can early-return on `null`.
 */
export function getTextFileUnsupportedState(
  fileType: AppFile["metadata"]["type"],
): ViewUnsupportedState | null {
  if (fileType === "folder") {
    return {
      icon: <FolderClosed />,
      title: "Folder selected",
      description: "Pick a note inside this folder to edit its contents.",
    };
  }

  if (fileType === "draw") {
    return {
      icon: <FilePenLine />,
      title: "Drawing files are not editable yet",
      description:
        "The notebook architecture is ready for draw files, but the note editor currently focuses on text notes.",
    };
  }

  if (fileType === "image") {
    return {
      icon: <FileImage />,
      title: "Image files are not editable yet",
      description:
        "Use note files for writing today; image-specific editing can be layered onto this file system next.",
    };
  }

  return null;
}

export function NotebookEmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="h-full p-6">
      <Empty className="h-full border-border">
        <EmptyHeader>
          <EmptyMedia variant="icon">{icon}</EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}

/**
 * Picks the right workspace-level empty state for the holder.
 *
 * Returns `null` when the workspace should render its tabs normally (e.g.
 * a supported file is selected, or there are still other tabs open even if
 * the current selection is unsupported).
 */
export const renderEmptyState = (
  hasAnyFiles: boolean,
  selectedFile: AppFile | null,
  openTabs: AppFile[],
) => {
  const unsupportedState = selectedFile
    ? getTextFileUnsupportedState(selectedFile.metadata.type)
    : null;

  if (!hasAnyFiles) {
    return {
      icon: <NotebookText />,
      title: "No files yet",
      description: "Create your first note or folder from the sidebar.",
    };
  }

  if (!selectedFile) {
    return {
      icon: <NotebookText />,
      title: "Select a file",
      description: "Choose a note from the sidebar to start writing.",
    };
  }

  // Only show the unsupported full-page state when there's nothing else open;
  // otherwise the existing tabs already provide context.
  if (unsupportedState && openTabs.length === 0) {
    return unsupportedState;
  }

  return null;
};

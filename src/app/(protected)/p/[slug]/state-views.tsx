import {
  FileImage,
  FilePenLine,
  FolderClosed,
  NotebookText,
} from "lucide-react";
import type { AppFile } from "@/hooks/use-notebooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export function getUnsupportedFileState(fileType: AppFile["metadata"]["type"]) {
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

export const renderEmptyState = (
  hasAnyFiles: boolean,
  selectedFile: AppFile | null,
  openTabs: AppFile[],
) => {
  const unsupportedState = selectedFile
    ? getUnsupportedFileState(selectedFile.metadata.type)
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

  if (unsupportedState && openTabs.length === 0) {
    return unsupportedState;
  }

  return null;
};

"use client";

import type { AppFile } from "@/data/modules/notebook/client-types";
import { NotebookActions } from "./actions";
import { NotebookBreadcrumbs } from "./breadcrumbs";

type Props = {
  notebookId: string;
  notebookName: string;
  files: AppFile[];
  activeFileId?: string;
  onNavigateToFile: (fileId: string) => void;
};

export default function NavBar({
  notebookId,
  notebookName,
  files,
  activeFileId,
  onNavigateToFile,
}: Props) {
  return (
    <div className="flex h-10 items-center justify-between bg-background/80 px-3 backdrop-blur">
      <NotebookBreadcrumbs
        notebookId={notebookId}
        notebookName={notebookName}
        files={files}
        activeFileId={activeFileId}
        onNavigateToFile={onNavigateToFile}
      />

      <NotebookActions />
    </div>
  );
}

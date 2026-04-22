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
    <div className="flex h-10 px-3 items-center justify-between bg-background">
      <NotebookBreadcrumbs
        notebookId={notebookId}
        notebookName={notebookName}
        files={files}
        activeFileId={activeFileId}
        onNavigateToFile={onNavigateToFile}
      />

      <NotebookActions notebookId={notebookId} activeFileId={activeFileId} />
    </div>
  );
}

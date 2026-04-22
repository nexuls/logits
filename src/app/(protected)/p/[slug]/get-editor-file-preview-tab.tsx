import { useEffect, useState } from "react";

import NavBar from "@/components/editor/nav";
import Preview from "@/components/editor/markdown-editor/preview";
import type { TabsViewTab } from "@/components/workspace/tabs";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { useNotebooks } from "@/hooks/use-notebooks";

import { getUnsupportedFileState, NotebookEmptyState } from "./helper";

type PreviewTabContentProps = {
  file: AppFile;
  notebookFiles: AppFile[];
  selectedNotebook: { id: string; name: string };
  navigateToFile: (fileId: string) => void;
};

function PreviewTabContent({
  file,
  notebookFiles,
  selectedNotebook,
  navigateToFile,
}: PreviewTabContentProps) {
  const { getFileContent } = useNotebooks();
  const [content, setContent] = useState("");

  useEffect(() => {
    let isCancelled = false;
    const fileIdAtRequestTime = file.id;

    void getFileContent(file.id).then((storedContent) => {
      if (isCancelled) return;
      if (file.id !== fileIdAtRequestTime) return;

      setContent(storedContent);
    });

    return () => {
      isCancelled = true;
    };
  }, [file.id, getFileContent]);

  return (
    <div className="h-full flex flex-col">
      <NavBar
        notebookId={selectedNotebook.id}
        notebookName={selectedNotebook.name}
        files={notebookFiles}
        activeFileId={file.id}
        onNavigateToFile={navigateToFile}
      />

      <Preview content={content} />
    </div>
  );
}

type GetEditorFilePreviewTabParams = {
  tabId: string;
  file: AppFile;
  notebookFiles: AppFile[];
  selectedNotebook: { id: string; name: string };
  navigateToFile: (fileId: string) => void;
};

export const getEditorFilePreviewTab = ({
  tabId,
  file,
  notebookFiles,
  selectedNotebook,
  navigateToFile,
}: GetEditorFilePreviewTabParams): TabsViewTab<{
  type: AppFile["metadata"]["type"];
  view: "preview";
  fileId: string;
}> => {
  const unsupportedFileState = getUnsupportedFileState(file.metadata.type);

  if (unsupportedFileState)
    return {
      id: tabId,
      title: `${file.name} (Preview)`,
      meta: {
        type: file.metadata.type,
        view: "preview",
        fileId: file.id,
      },
      content: (
        <NotebookEmptyState
          key={tabId}
          icon={unsupportedFileState.icon}
          title={unsupportedFileState.title}
          description={unsupportedFileState.description}
        />
      ),
    };

  return {
    id: tabId,
    title: `${file.name} (Preview)`,
    meta: {
      type: file.metadata.type,
      view: "preview",
      fileId: file.id,
    },
    content: (
      <PreviewTabContent
        key={tabId}
        file={file}
        notebookFiles={notebookFiles}
        selectedNotebook={selectedNotebook}
        navigateToFile={navigateToFile}
      />
    ),
  };
};

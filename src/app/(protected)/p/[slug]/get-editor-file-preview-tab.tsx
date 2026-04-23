import { useEffect, useState } from "react";

import Preview from "@/workspace-views/markdown-editor/preview";
import type { TabsViewTab } from "@/components/workspace";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { useNotebooks } from "@/hooks/use-notebooks";

import { getUnsupportedFileState, NotebookEmptyState } from "./state-views";

type PreviewTabContentProps = {
  file: AppFile;
};

function PreviewTabContent({ file }: PreviewTabContentProps) {
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

  return <Preview content={content} />;
}

type GetEditorFilePreviewTabParams = {
  tabId: string;
  file: AppFile;
};

export const getEditorFilePreviewTab = ({
  tabId,
  file,
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
    content: <PreviewTabContent key={tabId} file={file} />,
  };
};

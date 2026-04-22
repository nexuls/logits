import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

import {
  DEFAULT_CURSOR_META,
  type CursorMeta,
} from "@/components/editor/markdown-editor";
import Editor from "@/components/editor/markdown-editor";
import NavBar from "@/components/editor/nav";
import { getTextStats } from "@/components/editor/utils";
import { updateFooter } from "@/components/footer/index";
import type { TabsViewTab } from "@/components/workspace";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { useFileSelection } from "@/data/file-selection";
import { useNotebooks } from "@/hooks/use-notebooks";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

import { getUnsupportedFileState, NotebookEmptyState } from "./helper";

type EditorTabContentProps = {
  tabId: string;
  file: AppFile;
  cursorMetaRef: RefObject<Record<string, CursorMeta>>;
  notebookFiles: AppFile[];
  selectedNotebook: { id: string; name: string };
  navigateToFile: (fileId: string) => void;
};

function EditorTabContent({
  tabId,
  file,
  cursorMetaRef,
  notebookFiles,
  selectedNotebook,
  navigateToFile,
}: EditorTabContentProps) {
  const { selectedFileId, selectedTabMode } = useFileSelection();
  const isActive = selectedFileId === file.id && selectedTabMode === "editor";
  const { updateFileContent, getFileContent } = useNotebooks();

  const [content, setContent] = useState("");
  const [cursorMeta, setCursorMeta] = useState<CursorMeta>(
    cursorMetaRef.current[tabId] ?? DEFAULT_CURSOR_META,
  );

  const latestSaveRequestRef = useRef(0);
  const userChangedContentRef = useRef(false);

  // Hydrate from content store once when opening file if user has not edited yet.
  useEffect(() => {
    let isCancelled = false;
    const fileIdAtRequestTime = file.id;

    void getFileContent(file.id).then((storedContent) => {
      if (isCancelled) return;
      if (file.id !== fileIdAtRequestTime) return;
      if (userChangedContentRef.current) return;

      setContent(storedContent);
    });

    return () => {
      isCancelled = true;
    };
  }, [file.id, getFileContent]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (nextContent: string, requestId: number) => {
        await updateFileContent(file.id, nextContent);

        if (latestSaveRequestRef.current !== requestId) return;

        if (isActive) updateFooter("others", { saveStatus: "saved" });
      },
      { delayMs: 450 },
    );

  useEffect(() => {
    if (!isActive) return;

    updateFooter("stats", getTextStats(content));
    updateFooter("cursor", cursorMeta);
    updateFooter("others", { tabSize: cursorMeta.tabSize });
  }, [content, cursorMeta, isActive]);

  useEffect(() => () => flushDebouncedSave(), [flushDebouncedSave]);

  function editorMetaChangeHandler(meta: CursorMeta) {
    cursorMetaRef.current[tabId] = meta;
    setCursorMeta(meta);

    if (!isActive) return;

    updateFooter("cursor", meta);
    updateFooter("others", { tabSize: meta.tabSize });
  }

  function updateContent(nextContent: string) {
    userChangedContentRef.current = true;
    setContent(nextContent);

    if (isActive) {
      updateFooter("stats", getTextStats(nextContent));
      updateFooter("others", { saveStatus: "saving" });
    }

    const requestId = latestSaveRequestRef.current + 1;
    latestSaveRequestRef.current = requestId;
    debouncedSave(nextContent, requestId);
  }

  return (
    <div className="h-full flex flex-col">
      <NavBar
        notebookId={selectedNotebook.id}
        notebookName={selectedNotebook.name}
        files={notebookFiles}
        activeFileId={file.id}
        onNavigateToFile={navigateToFile}
      />

      <Editor
        mode="markdown"
        content={content}
        onEditorMetaChange={editorMetaChangeHandler}
        onContentChange={updateContent}
      />
    </div>
  );
}

type GetEditorFileTabParams = {
  tabId: string;
  file: AppFile;
  cursorMetaRef: RefObject<Record<string, CursorMeta>>;
  notebookFiles: AppFile[];
  selectedNotebook: { id: string; name: string };
  navigateToFile: (fileId: string) => void;
};

export const getEditorFileTab = ({
  tabId,
  file,
  cursorMetaRef,
  notebookFiles,
  selectedNotebook,
  navigateToFile,
}: GetEditorFileTabParams): TabsViewTab<{
  type: AppFile["metadata"]["type"];
  view: "editor";
  fileId: string;
}> => {
  const unsupportedFileState = getUnsupportedFileState(file.metadata.type);

  if (unsupportedFileState)
    return {
      id: tabId,
      title: file.name,
      meta: {
        type: file.metadata.type,
        view: "editor",
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
    title: file.name,
    meta: {
      type: file.metadata.type,
      view: "editor",
      fileId: file.id,
    },
    content: (
      <EditorTabContent
        key={tabId}
        tabId={tabId}
        file={file}
        cursorMetaRef={cursorMetaRef}
        notebookFiles={notebookFiles}
        selectedNotebook={selectedNotebook}
        navigateToFile={navigateToFile}
      />
    ),
  };
};

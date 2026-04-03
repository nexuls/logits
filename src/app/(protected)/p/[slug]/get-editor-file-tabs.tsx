import type { RefObject } from "react";

import type { CursorMeta } from "@/components/editor/markdown-editor";
import {
  FOOTER_FIELD_IDS,
  setFooterField,
  updateFooter,
} from "@/components/footer/index";
import { getTextStats } from "@/components/editor/utils";
import type { TabsViewTab } from "@/components/tabs";

import type { AppFile } from "@/data/modules/notebook/client-types";

import { getUnsupportedFileState, NotebookEmptyState } from "./helper";
import NavBar from "@/components/editor/nav";
import Editor from "@/components/editor/markdown-editor";

interface GetEditorFileTabsParams {
  openTabs: AppFile[];
  selectedNotebook: { id: string; name: string };
  notebookFiles: AppFile[];
  selectedFileId: string;
  draftsByFileIdRef: RefObject<Record<string, string>>;
  cursorMetaRef: RefObject<Record<string, CursorMeta>>;
  latestSaveRequestRef: RefObject<Record<string, number>>;
  navigateToFile: (fileId: string) => void;
  debouncedSave: (fileId: string, content: string, requestId: number) => void;
}

export const getEditorFileTabs = ({
  openTabs,
  selectedNotebook,
  notebookFiles,
  selectedFileId,
  draftsByFileIdRef,
  cursorMetaRef,
  latestSaveRequestRef,
  navigateToFile,
  debouncedSave,
}: GetEditorFileTabsParams): TabsViewTab<{
  type: AppFile["metadata"]["type"];
}>[] =>
  openTabs.map((file) => {
    const unsupportedFileState = getUnsupportedFileState(file.metadata.type);

    if (unsupportedFileState)
      return {
        id: file.id,
        title: file.name,
        meta: {
          type: file.metadata.type,
        },
        content: (
          <NotebookEmptyState
            key={file.id}
            icon={unsupportedFileState.icon}
            title={unsupportedFileState.title}
            description={unsupportedFileState.description}
          />
        ),
      };

    const fileContent =
      draftsByFileIdRef.current[file.id] !== undefined
        ? draftsByFileIdRef.current[file.id]
        : file.content;

    function editorMetaChangeHandler(meta: CursorMeta) {
      cursorMetaRef.current[file.id] = meta;

      if (selectedFileId !== file.id) return;

      setFooterField(FOOTER_FIELD_IDS.tabSize, `Spaces: ${meta.tabSize}`);
      updateFooter("cursor", meta);
    }

    function updateContent(newContent: string) {
      draftsByFileIdRef.current[file.id] = newContent;

      if (selectedFileId === file.id) {
        updateFooter("stats", getTextStats(newContent));
        setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saving");
      }

      const requestId = (latestSaveRequestRef.current[file.id] ?? 0) + 1;
      latestSaveRequestRef.current[file.id] = requestId;
      debouncedSave(file.id, newContent, requestId);
    }

    return {
      id: file.id,
      title: file.name,
      meta: {
        type: file.metadata.type,
      },
      content: (
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
            content={fileContent}
            onEditorMetaChange={editorMetaChangeHandler}
            onContentChange={updateContent}
          />
        </div>
      ),
    };
  });

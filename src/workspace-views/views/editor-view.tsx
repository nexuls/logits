"use client";

/**
 * Markdown editor workspace view.
 *
 * Owns the lifecycle of a single open editor tab:
 *   - hydrates content from IDB once per file id (and skips the rehydrate if
 *     the user has already typed, so we never clobber unsaved edits);
 *   - debounces writes back through `useNotebooks().updateFileContent`;
 *   - mirrors the active tab's cursor/stats/save status into the footer;
 *   - persists cursor meta via the shared {@link useCursorMetaStore} so the
 *     footer can keep displaying the last-known cursor when this component
 *     unmounts (tab switch, split close).
 */

import { useEffect, useRef, useState } from "react";

import Editor, {
  DEFAULT_CURSOR_META,
  type CursorMeta,
} from "@/components/markdown-editor/editor";
import { getTextStats } from "@/components/markdown-editor/utils";
import { updateFooter } from "@/components/footer/index";
import { useFileSelection } from "@/data/file-selection";
import { useNotebooks } from "@/hooks/use-notebooks";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

import { useCursorMetaStore } from "../../components/markdown-editor/cursor-meta";
import { getTextFileUnsupportedState } from "../empty-states";
import type { WorkspaceView, WorkspaceViewProps } from "../types";

const VIEW_NAME = "editor";

function EditorViewContent({ tabId, fileId }: WorkspaceViewProps) {
  const cursorMetaStore = useCursorMetaStore();
  const { selectedFileId, selectedViewName } = useFileSelection();
  const isActive = selectedFileId === fileId && selectedViewName === VIEW_NAME;

  const { updateFileContent, getFileContent } = useNotebooks();

  const [content, setContent] = useState("");
  const [cursorMeta, setCursorMeta] = useState<CursorMeta>(() =>
    cursorMetaStore.read(tabId),
  );

  // Bumped on every keystroke; used to discard stale debounced saves so a
  // late-resolving write can't flip the footer back to "saved" after a newer
  // edit started.
  const latestSaveRequestRef = useRef(0);
  // Once the user types we must not overwrite their buffer with a slow IDB
  // read that started before they edited.
  const userChangedContentRef = useRef(false);

  useEffect(() => {
    let isCancelled = false;

    void getFileContent(fileId).then((storedContent) => {
      if (isCancelled) return;
      if (userChangedContentRef.current) return;

      setContent(storedContent);
    });

    return () => {
      isCancelled = true;
    };
  }, [fileId, getFileContent]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (nextContent: string, requestId: number) => {
        await updateFileContent(fileId, nextContent);

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
    cursorMetaStore.write(tabId, meta);
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
    <Editor
      mode="markdown"
      content={content}
      onEditorMetaChange={editorMetaChangeHandler}
      onContentChange={updateContent}
    />
  );
}

export const editorView: WorkspaceView = {
  name: VIEW_NAME,
  getTitle: (file) => file.name,
  getUnsupportedState: (file) =>
    getTextFileUnsupportedState(file.metadata.type),
  Component: EditorViewContent,
};

export { DEFAULT_CURSOR_META };

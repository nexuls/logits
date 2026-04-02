"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import type { AppFile } from "@/data/modules/notebook/client-types";
import Editor, {
  DEFAULT_CURSOR_META,
  type CursorMeta,
} from "@/components/editor/markdown-editor";
import NavBar from "@/components/editor/nav";
import Footer, {
  FOOTER_FIELD_IDS,
  getTextStats,
  setFooterField,
  updateFooterCursor,
  updateFooterStats,
} from "@/components/footer/index";
import Header from "@/components/tabs/header";
import TabsView, { type TabsViewTab } from "@/components/tabs";
import { buildNotebookUrl } from "@/lib/notebook-url";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useNotebooks } from "../../../../hooks/use-notebooks";
import {
  getUnsupportedFileState,
  NotebookEmptyState,
  renderEmptyState,
} from "./helper";

// Keep file ordering stable and predictable in tab/open file logic.
function getNotebookTree(files: AppFile[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder)
      return first.metadata.fileOrder - second.metadata.fileOrder;

    return first.name.localeCompare(second.name);
  });
}

function getNotebookTabStorageKey(notebookId: string) {
  return `logits:open-tabs:${notebookId}`;
}

function readStoredTabIds(notebookId: string) {
  if (typeof window === "undefined") return [];

  const storedTabs = window.localStorage.getItem(
    getNotebookTabStorageKey(notebookId),
  );

  if (!storedTabs) return [];

  try {
    const parsedTabs = JSON.parse(storedTabs);
    return Array.isArray(parsedTabs) ? parsedTabs : [];
  } catch {
    return [];
  }
}

function getDraftContent(
  draftsByFileId: Record<string, string>,
  file: AppFile | null,
) {
  if (!file || file.metadata.type !== "file") return "";

  return draftsByFileId[file.id] ?? file.content;
}

export default function Holder({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    notebooks,
    isHydrating,
    updateFileContent,
    getNotebookFiles,
    getFileContent,
  } = useNotebooks();

  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);
  const [, setEditorRevision] = useState(0);

  // Refs keep fast-changing editor data out of React render cycle.
  const draftsByFileIdRef = useRef<Record<string, string>>({});
  const latestSaveRequestRef = useRef<Record<string, number>>({});
  const cursorMetaRef = useRef<Record<string, CursorMeta>>({});
  const activeFileIdRef = useRef("");
  const lastSelectedFileIdRef = useRef("");

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === slug) ?? null,
    [notebooks, slug],
  );
  const notebookFiles = useMemo(
    () => (selectedNotebook ? getNotebookFiles(selectedNotebook.id) : []),
    [getNotebookFiles, selectedNotebook],
  );
  const selectedFileId = searchParams.get("file") ?? "";
  const selectedFile = useMemo(
    () => notebookFiles.find((file) => file.id === selectedFileId) ?? null,
    [notebookFiles, selectedFileId],
  );
  const openableFiles = useMemo(
    () => notebookFiles.filter((file) => file.metadata.type !== "folder"),
    [notebookFiles],
  );
  const firstOpenableFile = useMemo(
    () => getNotebookTree(openableFiles)[0] ?? null,
    [openableFiles],
  );
  const openTabs = useMemo(() => {
    const filesById = new Map(openableFiles.map((file) => [file.id, file]));

    return openTabIds
      .map((tabId) => filesById.get(tabId))
      .filter((file): file is AppFile => Boolean(file));
  }, [openTabIds, openableFiles]);

  const activeDraftContent = getDraftContent(
    draftsByFileIdRef.current,
    selectedFile,
  );

  const markdownStats = useMemo(
    () => getTextStats(activeDraftContent),
    [activeDraftContent],
  );

  const footerView =
    selectedFile?.metadata.type === "file" ? "markdown" : "other";

  const navigateToFile = useCallback(
    (fileId: string) => {
      if (!selectedNotebook) return;

      router.push(
        buildNotebookUrl(selectedNotebook.id, {
          fileId,
          searchParams,
        }),
      );
    },
    [router, searchParams, selectedNotebook],
  );

  // Restore persisted tabs for notebook.
  useEffect(() => {
    setOpenTabIds(readStoredTabIds(slug));
    setLoadedTabsSlug(slug);
  }, [slug]);

  // Persist tabs after restoring initial state for current notebook.
  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsSlug !== slug) {
      return;
    }

    window.localStorage.setItem(
      getNotebookTabStorageKey(slug),
      JSON.stringify(openTabIds),
    );
  }, [loadedTabsSlug, openTabIds, slug]);

  // Keep local refs and tabs aligned with available files.
  useEffect(() => {
    const validFileIds = new Set(openableFiles.map((file) => file.id));

    for (const file of openableFiles) {
      if (draftsByFileIdRef.current[file.id] === undefined) {
        draftsByFileIdRef.current[file.id] = file.content;
      }
    }

    for (const fileId of Object.keys(draftsByFileIdRef.current)) {
      if (!validFileIds.has(fileId)) {
        delete draftsByFileIdRef.current[fileId];
        delete latestSaveRequestRef.current[fileId];
        delete cursorMetaRef.current[fileId];
      }
    }

    setOpenTabIds((currentTabs) =>
      currentTabs.filter((tabId) => validFileIds.has(tabId)),
    );
  }, [openableFiles]);

  useEffect(() => {
    activeFileIdRef.current = selectedFileId;
  }, [selectedFileId]);

  // Auto-open selected non-folder file in tab strip.
  useEffect(() => {
    if (!selectedFile || selectedFile.metadata.type === "folder") {
      return;
    }

    setOpenTabIds((currentTabs) =>
      currentTabs.includes(selectedFile.id)
        ? currentTabs
        : [...currentTabs, selectedFile.id],
    );
  }, [selectedFile]);

  // Redirect to a fallback file when query param points to a missing file.
  useEffect(() => {
    if (!selectedNotebook || selectedFile) {
      return;
    }

    const fallbackFileId = selectedFileId
      ? (openTabIds[openTabIds.length - 1] ?? firstOpenableFile?.id ?? "")
      : (openTabIds[openTabIds.length - 1] ?? "");

    if (!fallbackFileId) {
      return;
    }

    router.replace(
      buildNotebookUrl(selectedNotebook.id, {
        fileId: fallbackFileId,
        searchParams,
      }),
    );
  }, [
    firstOpenableFile,
    openTabIds,
    router,
    selectedFile,
    selectedFileId,
    selectedNotebook,
    searchParams,
  ]);

  // Sync active file content without binding each keystroke to component state.
  useEffect(() => {
    if (!selectedFileId) {
      return;
    }

    let isCancelled = false;

    if (!selectedFile) {
      return;
    }

    if (draftsByFileIdRef.current[selectedFile.id] === undefined) {
      draftsByFileIdRef.current[selectedFile.id] = selectedFile.content;
    }

    if (selectedFile.metadata.type === "file") {
      updateFooterStats(draftsByFileIdRef.current[selectedFile.id]);
      setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
      setEditorRevision((current) => current + 1);
    }

    if (selectedFile.metadata.type !== "file") {
      return;
    }

    void getFileContent(selectedFile.id).then((content) => {
      if (isCancelled) return;

      draftsByFileIdRef.current[selectedFile.id] = content;

      if (activeFileIdRef.current === selectedFile.id) {
        updateFooterStats(content);
        setEditorRevision((current) => current + 1);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [getFileContent, selectedFile, selectedFileId]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (fileId: string, content: string, requestId: number) => {
        await updateFileContent(fileId, content);

        if ((latestSaveRequestRef.current[fileId] ?? 0) !== requestId) return;

        if (activeFileIdRef.current === fileId)
          setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
      },
      { delayMs: 450 },
    );

  useEffect(() => {
    cursorMetaRef.current = {};
    setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
    setFooterField(FOOTER_FIELD_IDS.cursor, "Ln 1, Col 1");
    setFooterField(FOOTER_FIELD_IDS.tabSize, "Spaces: 2");
  }, []);

  useEffect(() => {
    const activeCursor = selectedFileId
      ? (cursorMetaRef.current[selectedFileId] ?? DEFAULT_CURSOR_META)
      : DEFAULT_CURSOR_META;

    setFooterField(
      FOOTER_FIELD_IDS.cursor,
      `Ln ${activeCursor.line}, Col ${activeCursor.col}`,
    );
    setFooterField(FOOTER_FIELD_IDS.tabSize, `Spaces: ${activeCursor.tabSize}`);
  }, [selectedFileId]);

  useEffect(() => {
    if (
      lastSelectedFileIdRef.current &&
      lastSelectedFileIdRef.current !== selectedFileId
    ) {
      flushDebouncedSave();
    }

    lastSelectedFileIdRef.current = selectedFileId;
  }, [flushDebouncedSave, selectedFileId]);

  useEffect(
    () => () => {
      flushDebouncedSave();
    },
    [flushDebouncedSave],
  );

  const tabs = useMemo<
    TabsViewTab<{ type: AppFile["metadata"]["type"] }>[]
  >(() => {
    if (!selectedNotebook) return [];

    return openTabs.map((file) => {
      const unsupportedFileState = getUnsupportedFileState(file.metadata.type);
      const fileContent =
        draftsByFileIdRef.current[file.id] !== undefined
          ? draftsByFileIdRef.current[file.id]
          : file.content;

      function editorMetaChangeHandler(meta: CursorMeta) {
        cursorMetaRef.current[file.id] = meta;

        if (selectedFileId !== file.id) return;

        setFooterField(FOOTER_FIELD_IDS.tabSize, `Spaces: ${meta.tabSize}`);
        updateFooterCursor(meta);
      }

      function updateContent(newContent: string) {
        draftsByFileIdRef.current[file.id] = newContent;

        if (selectedFileId === file.id) {
          updateFooterStats(newContent);
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
        content: unsupportedFileState ? (
          <NotebookEmptyState
            icon={unsupportedFileState.icon}
            title={unsupportedFileState.title}
            description={unsupportedFileState.description}
          />
        ) : (
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
  }, [
    debouncedSave,
    navigateToFile,
    notebookFiles,
    openTabs,
    selectedFileId,
    selectedNotebook,
  ]);

  if (isHydrating) {
    return (
      <div className="relative h-dvh w-full bg-background">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!selectedNotebook) {
    return (
      <div className="relative h-dvh w-full bg-background">
        <Header placeholder />
        <NotebookEmptyState
          icon={<TriangleAlertIcon />}
          title="Notebook not found."
          description="It may have been deleted or the link is out of date."
        />
      </div>
    );
  }

  const hasAnyFiles = notebookFiles.length > 0;
  const emptyState = renderEmptyState(hasAnyFiles, selectedFile, openTabs);

  const closeTab = (fileId: string) => {
    setOpenTabIds((currentTabs) => {
      const currentIndex = currentTabs.indexOf(fileId);

      if (currentIndex === -1) {
        return currentTabs;
      }

      const nextTabs = currentTabs.filter((tabId) => tabId !== fileId);

      if (selectedFileId === fileId) {
        const fallbackTabId =
          currentTabs[currentIndex + 1] ?? currentTabs[currentIndex - 1] ?? "";

        if (fallbackTabId) {
          navigateToFile(fallbackTabId);
        } else {
          router.push(buildNotebookUrl(selectedNotebook.id));
        }
      }

      return nextTabs;
    });
  };

  return (
    <div className="relative h-dvh w-[calc(100%-18rem)] flex-1 flex flex-col bg-background">
      <main className="min-h-0 w-full flex-1">
        {emptyState ? (
          <>
            <Header
              placeholder={false}
              tabs={openTabs.map((file) => ({
                id: file.id,
                name: file.name,
                type: file.metadata.type,
                isActive: file.id === selectedFileId,
              }))}
              onTabSelect={navigateToFile}
              onTabClose={closeTab}
            />

            <NotebookEmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
            />
          </>
        ) : (
          <TabsView
            tabs={tabs}
            activeTabId={selectedFileId}
            defaultActiveTabId={firstOpenableFile?.id}
            onTabSelect={navigateToFile}
            onTabClose={closeTab}
          />
        )}
      </main>

      <Footer
        view={footerView}
        markdownMeta={
          footerView === "markdown"
            ? {
                ...markdownStats,
                line:
                  selectedFileId && cursorMetaRef.current[selectedFileId]
                    ? cursorMetaRef.current[selectedFileId].line
                    : DEFAULT_CURSOR_META.line,
                col:
                  selectedFileId && cursorMetaRef.current[selectedFileId]
                    ? cursorMetaRef.current[selectedFileId].col
                    : DEFAULT_CURSOR_META.col,
                tabSize:
                  selectedFileId && cursorMetaRef.current[selectedFileId]
                    ? cursorMetaRef.current[selectedFileId].tabSize
                    : DEFAULT_CURSOR_META.tabSize,
                selection:
                  selectedFileId && cursorMetaRef.current[selectedFileId]
                    ? cursorMetaRef.current[selectedFileId].selection
                    : DEFAULT_CURSOR_META.selection,
                version: "v0.1.0",
                saveStatus: "saved",
              }
            : undefined
        }
      />
    </div>
  );
}

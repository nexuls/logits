"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";
import type { AppFile } from "@/data/modules/notebook/client-types";
import Editor from "@/components/editor/markdown-editor";
import NavBar from "@/components/editor/nav";
import Footer from "@/components/footer/index";
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

type CursorMeta = {
  line: number;
  col: number;
  tabSize: number;
  selection: number;
};

const DEFAULT_CURSOR_META: CursorMeta = {
  line: 1,
  col: 1,
  tabSize: 2,
  selection: 0,
};

const FOOTER_FIELD_IDS = {
  lines: "logits-footer-lines",
  chars: "logits-footer-chars",
  words: "logits-footer-words",
  cursor: "logits-footer-cursor",
  tabSize: "logits-footer-tabsize",
  saveStatus: "logits-footer-save-status",
} as const;

// Keep file ordering stable and predictable in tab/open file logic.
function getNotebookTree(files: AppFile[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder) {
      return first.metadata.fileOrder - second.metadata.fileOrder;
    }

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

function getTextStats(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const totalLines =
    normalized.length === 0 ? 1 : normalized.split("\n").length;
  const totalChars = content.length;
  const totalWords = content.trim().length
    ? (content.trim().match(/\S+/g)?.length ?? 0)
    : 0;

  return {
    totalLines,
    totalChars,
    totalWords,
  };
}

function setFooterField(id: string, value: string) {
  if (typeof document === "undefined") return;

  const element = document.getElementById(id);

  if (!element || element.textContent === value) return;

  element.textContent = value;
}

function updateFooterStats(content: string) {
  const stats = getTextStats(content);
  setFooterField(FOOTER_FIELD_IDS.lines, String(stats.totalLines));
  setFooterField(FOOTER_FIELD_IDS.chars, String(stats.totalChars));
  setFooterField(FOOTER_FIELD_IDS.words, String(stats.totalWords));
}

function updateFooterCursor(meta: {
  line: number;
  col: number;
  selection: number;
}) {
  const cursorValue = `Ln ${meta.line}, Col ${meta.col}${
    meta.selection > 0 ? ` (${meta.selection} selected)` : ""
  }`;
  setFooterField(FOOTER_FIELD_IDS.cursor, cursorValue);
}

export default function Holder({ slug }: { slug: string }) {
  // Routing and data access.
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    notebooks,
    isHydrating,
    updateFileContent,
    getNotebookFiles,
    getFileContent,
  } = useNotebooks();

  // UI/editor state.
  const [draftByFileId, setDraftByFileId] = useState<Record<string, string>>(
    {},
  );
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);

  // Guards against out-of-order async save completion.
  const latestSaveRequestRef = useRef<Record<string, number>>({});
  const cursorMetaRef = useRef<Record<string, CursorMeta>>({});

  // Derived entities.
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

  // Drop stale tabs when files were deleted or moved.
  useEffect(() => {
    const validFileIds = new Set(openableFiles.map((file) => file.id));

    setOpenTabIds((currentTabs) =>
      currentTabs.filter((tabId) => validFileIds.has(tabId)),
    );
  }, [openableFiles]);

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

  // Sync editor content only when active file changes.
  useEffect(() => {
    if (!selectedFileId) {
      return;
    }

    let isCancelled = false;

    if (!selectedFile) {
      return;
    }

    setDraftByFileId((currentDrafts) => {
      if (currentDrafts[selectedFile.id] !== undefined) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [selectedFile.id]: selectedFile.content,
      };
    });

    if (selectedFile.metadata.type !== "file") {
      return;
    }

    void getFileContent(selectedFile.id).then((content) => {
      if (isCancelled) return;

      setDraftByFileId((currentDrafts) => ({
        ...currentDrafts,
        [selectedFile.id]: content,
      }));
    });

    return () => {
      isCancelled = true;
    };
  }, [getFileContent, selectedFile, selectedFileId]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (fileId: string, content: string, requestId: number) => {
        await updateFileContent(fileId, content);

        if ((latestSaveRequestRef.current[fileId] ?? 0) !== requestId) {
          return;
        }

        if (selectedFileId === fileId) {
          setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
        }
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
    setDraftByFileId((currentDrafts) => {
      if (!openableFiles.length && Object.keys(currentDrafts).length === 0) {
        return currentDrafts;
      }

      const nextDrafts: Record<string, string> = {};

      for (const file of openableFiles) {
        nextDrafts[file.id] =
          currentDrafts[file.id] !== undefined
            ? currentDrafts[file.id]
            : file.content;
      }

      return nextDrafts;
    });
  }, [openableFiles]);

  const activeDraftContent = useMemo(() => {
    if (!selectedFile || selectedFile.metadata.type !== "file") {
      return "";
    }

    return draftByFileId[selectedFile.id] ?? selectedFile.content;
  }, [draftByFileId, selectedFile]);

  useEffect(() => {
    if (selectedFile?.metadata.type === "file") {
      updateFooterStats(activeDraftContent);
    }
  }, [activeDraftContent, selectedFile?.metadata.type]);

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
    if (!selectedFileId) {
      return;
    }

    // Ensure pending edits are flushed when file selection changes.
    return () => {
      flushDebouncedSave();
    };
  }, [flushDebouncedSave, selectedFileId]);

  const markdownStats = useMemo(
    () => getTextStats(activeDraftContent),
    [activeDraftContent],
  );

  const footerView =
    selectedFile?.metadata.type === "file" ? "markdown" : "other";

  const tabs = useMemo<
    TabsViewTab<{ type: AppFile["metadata"]["type"] }>[]
  >(() => {
    if (!selectedNotebook) return [];

    return openTabs.map((file) => {
      const unsupportedFileState = getUnsupportedFileState(file.metadata.type);

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
              onNavigateToFile={(fileId) => {
                router.push(
                  buildNotebookUrl(selectedNotebook.id, {
                    fileId,
                    searchParams,
                  }),
                );
              }}
            />

            <Editor
              mode="markdown"
              content={draftByFileId[file.id] ?? file.content}
              onEditorMetaChange={(meta) => {
                cursorMetaRef.current[file.id] = meta;

                if (selectedFileId !== file.id) {
                  return;
                }

                setFooterField(
                  FOOTER_FIELD_IDS.tabSize,
                  `Spaces: ${meta.tabSize}`,
                );
                updateFooterCursor(meta);
              }}
              onContentChange={(newContent) => {
                setDraftByFileId((currentDrafts) => ({
                  ...currentDrafts,
                  [file.id]: newContent,
                }));

                if (selectedFileId === file.id) {
                  updateFooterStats(newContent);
                  setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saving");
                }

                const requestId =
                  (latestSaveRequestRef.current[file.id] ?? 0) + 1;

                latestSaveRequestRef.current[file.id] = requestId;
                debouncedSave(file.id, newContent, requestId);
              }}
            />
          </div>
        ),
      };
    });
  }, [
    debouncedSave,
    draftByFileId,
    notebookFiles,
    openTabs,
    router,
    searchParams,
    selectedFileId,
    selectedNotebook,
  ]);

  const tabsForHeader = useMemo(
    () =>
      openTabs.map((file) => ({
        id: file.id,
        name: file.name,
        type: file.metadata.type,
        isActive: file.id === selectedFileId,
      })),
    [openTabs, selectedFileId],
  );

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

  const openTab = (fileId: string) => {
    router.push(
      buildNotebookUrl(selectedNotebook.id, {
        fileId,
        searchParams,
      }),
    );
  };

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
          router.push(
            buildNotebookUrl(selectedNotebook.id, {
              fileId: fallbackTabId,
              searchParams,
            }),
          );
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
              tabs={tabsForHeader}
              onTabSelect={openTab}
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
            onTabSelect={openTab}
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

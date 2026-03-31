"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileImage,
  FilePenLine,
  FolderClosed,
  NotebookText,
  TriangleAlertIcon,
} from "lucide-react";
import type { AppFile } from "@/data/schema";
import Editor from "@/components/editor/markdown-editor";
import NavBar from "@/components/editor/nav";
import Footer from "@/components/footer/index";
import Header from "@/components/header/index";
import { buildNotebookUrl } from "@/lib/notebook-url";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import { useNotebooks } from "@/hooks/use-notebooks";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

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

function getUnsupportedFileState(fileType: AppFile["metadata"]["type"]) {
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

function NotebookEmptyState({
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

export default function Holder({ slug }: { slug: string }) {
  // Routing and data access.
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notebooks, isHydrating, updateFileContent, getNotebookFiles } =
    useNotebooks();

  // UI/editor state.
  const [draftContent, setDraftContent] = useState("");
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);

  // Guards against out-of-order async save completion.
  const latestSaveRequestRef = useRef(0);
  const cursorMetaRef = useRef<CursorMeta>(DEFAULT_CURSOR_META);

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
      setDraftContent("");
      return;
    }

    setDraftContent(selectedFile?.content ?? "");
  }, [selectedFile?.content, selectedFileId]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (fileId: string, content: string, requestId: number) => {
        await updateFileContent(fileId, content);

        if (latestSaveRequestRef.current !== requestId) {
          return;
        }

        setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
      },
      { delayMs: 450 },
    );

  useEffect(() => {
    cursorMetaRef.current = DEFAULT_CURSOR_META;
    setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saved");
    setFooterField(FOOTER_FIELD_IDS.cursor, "Ln 1, Col 1");
    setFooterField(FOOTER_FIELD_IDS.tabSize, "Spaces: 2");
  }, []);

  useEffect(() => {
    if (selectedFile?.metadata.type === "file") {
      updateFooterStats(selectedFile.content);
    }
  }, [selectedFile?.content, selectedFile?.metadata.type]);

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
    () => getTextStats(draftContent),
    [draftContent],
  );

  const footerView =
    selectedFile?.metadata.type === "file" ? "markdown" : "other";

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
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          <Empty className="h-full border-border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <TriangleAlertIcon />
              </EmptyMedia>
              <EmptyTitle>Notebook not found.</EmptyTitle>
              <EmptyDescription>
                It may have been deleted or the link is out of date.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      </div>
    );
  }

  const hasAnyFiles = notebookFiles.length > 0;
  const unsupportedState = selectedFile
    ? getUnsupportedFileState(selectedFile.metadata.type)
    : null;

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
      <Header
        placeholder={false}
        notebookName={selectedNotebook.name}
        currentFileName={selectedFile?.name}
        tabs={openTabs.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.metadata.type,
          isActive: file.id === selectedFileId,
        }))}
        onTabSelect={openTab}
        onTabClose={closeTab}
      />

      <main className="min-h-0 w-full flex-1">
        {!hasAnyFiles ? (
          <NotebookEmptyState
            icon={<NotebookText />}
            title="No files yet"
            description="Create your first note or folder from the sidebar."
          />
        ) : !selectedFile ? (
          <NotebookEmptyState
            icon={<NotebookText />}
            title="Select a file"
            description="Choose a note from the sidebar to start writing."
          />
        ) : unsupportedState ? (
          <NotebookEmptyState
            icon={unsupportedState.icon}
            title={unsupportedState.title}
            description={unsupportedState.description}
          />
        ) : (
          <div className="h-full flex flex-col">
            <NavBar
              notebookId={selectedNotebook.id}
              notebookName={selectedNotebook.name}
              files={notebookFiles}
              activeFileId={selectedFile.id}
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
              content={draftContent}
              onEditorMetaChange={(meta) => {
                cursorMetaRef.current = meta;
                setFooterField(
                  FOOTER_FIELD_IDS.tabSize,
                  `Spaces: ${meta.tabSize}`,
                );
                updateFooterCursor(meta);
              }}
              onContentChange={(newContent) => {
                if (!selectedFile?.id) return;

                updateFooterStats(newContent);
                setFooterField(FOOTER_FIELD_IDS.saveStatus, "Saving");
                const requestId = latestSaveRequestRef.current + 1;
                latestSaveRequestRef.current = requestId;
                debouncedSave(selectedFile.id, newContent, requestId);
              }}
            />
          </div>
        )}
      </main>

      <Footer
        view={footerView}
        markdownMeta={
          footerView === "markdown"
            ? {
                ...markdownStats,
                line: cursorMetaRef.current.line,
                col: cursorMetaRef.current.col,
                tabSize: cursorMetaRef.current.tabSize,
                selection: cursorMetaRef.current.selection,
                version: "v0.1.0",
                saveStatus: "saved",
              }
            : undefined
        }
      />
    </div>
  );
}

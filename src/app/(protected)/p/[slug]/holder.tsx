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
import Header from "@/components/header";
import { useNotebooks } from "@/hooks/use-notebooks";
import type { AppFile } from "@/data/schema";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import Footer from "@/components/footer";
import Editor from "@/components/editor/markdown-editor";
import NavBar from "@/components/editor/nav";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";

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
  if (typeof document === "undefined") {
    return;
  }

  const element = document.getElementById(id);

  if (!element || element.textContent === value) {
    return;
  }

  element.textContent = value;
}

function updateFooterStats(content: string) {
  const stats = getTextStats(content);
  setFooterField("logits-footer-lines", String(stats.totalLines));
  setFooterField("logits-footer-chars", String(stats.totalChars));
  setFooterField("logits-footer-words", String(stats.totalWords));
}

function updateFooterCursor(meta: {
  line: number;
  col: number;
  selection: number;
}) {
  const cursorValue = `Ln ${meta.line}, Col ${meta.col}${
    meta.selection > 0 ? ` (${meta.selection} selected)` : ""
  }`;
  setFooterField("logits-footer-cursor", cursorValue);
}

export default function Holder({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notebooks, isHydrating, updateFileContent, getNotebookFiles } =
    useNotebooks();
  const [draftContent, setDraftContent] = useState("");
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsForSlug, setLoadedTabsForSlug] = useState<string | null>(
    null,
  );
  const latestSaveRequestRef = useRef(0);
  const currentEditingFileIdRef = useRef("");
  const cursorMetaRef = useRef({ line: 1, col: 1, tabSize: 2, selection: 0 });

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

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTabs = window.localStorage.getItem(
      getNotebookTabStorageKey(slug),
    );

    if (!storedTabs) {
      setOpenTabIds([]);
      setLoadedTabsForSlug(slug);
      return;
    }

    try {
      const parsedTabs = JSON.parse(storedTabs);
      setOpenTabIds(Array.isArray(parsedTabs) ? parsedTabs : []);
    } catch {
      setOpenTabIds([]);
    }

    setLoadedTabsForSlug(slug);
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsForSlug !== slug) {
      return;
    }

    window.localStorage.setItem(
      getNotebookTabStorageKey(slug),
      JSON.stringify(openTabIds),
    );
  }, [loadedTabsForSlug, openTabIds, slug]);

  useEffect(() => {
    const validFileIds = new Set(openableFiles.map((file) => file.id));

    setOpenTabIds((currentTabs) =>
      currentTabs.filter((tabId) => validFileIds.has(tabId)),
    );
  }, [openableFiles]);

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

    router.replace(`/p/${selectedNotebook.id}?file=${fallbackFileId}`);
  }, [
    firstOpenableFile,
    openTabIds,
    router,
    selectedFile,
    selectedFileId,
    selectedNotebook,
  ]);

  useEffect(() => {
    if (!selectedFileId) {
      setDraftContent("");
      return;
    }

    setDraftContent(selectedFile?.content ?? "");
  }, [selectedFile?.id, selectedFileId]);

  const { debounced: debouncedSave, flush: flushDebouncedSave } =
    useDebouncedCallback(
      async (fileId: string, content: string, requestId: number) => {
        await updateFileContent(fileId, content);

        if (latestSaveRequestRef.current !== requestId) return;

        if (currentEditingFileIdRef.current === fileId)
          setDraftContent(content);

        setFooterField("logits-footer-save-status", "Saved");
      },
      { delayMs: 450 },
    );

  useEffect(() => {
    currentEditingFileIdRef.current = selectedFileId;
    cursorMetaRef.current = { line: 1, col: 1, tabSize: 2, selection: 0 };
    setFooterField("logits-footer-save-status", "Saved");
    setFooterField("logits-footer-cursor", "Ln 1, Col 1");
    setFooterField("logits-footer-tabsize", "Spaces: 2");
  }, [selectedFileId]);

  useEffect(() => {
    if (selectedFile?.metadata.type === "file") {
      updateFooterStats(selectedFile.content);
    }
  }, [selectedFile?.content, selectedFile?.metadata.type]);

  useEffect(() => {
    if (!selectedFileId) {
      return;
    }

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

  const openTab = (fileId: string) => {
    router.push(`/p/${selectedNotebook.id}?file=${fileId}`);
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
          router.push(`/p/${selectedNotebook.id}?file=${fallbackTabId}`);
        } else {
          router.push(`/p/${selectedNotebook.id}`);
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
          <div className="h-full p-6">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <NotebookText />
                </EmptyMedia>
                <EmptyTitle>No files yet</EmptyTitle>
                <EmptyDescription>
                  Create your first note or folder from the sidebar.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : !selectedFile ? (
          <div className="h-full p-6">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <NotebookText />
                </EmptyMedia>
                <EmptyTitle>Select a file</EmptyTitle>
                <EmptyDescription>
                  Choose a note from the sidebar to start writing.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : selectedFile.metadata.type === "folder" ? (
          <div className="h-full p-6">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderClosed />
                </EmptyMedia>
                <EmptyTitle>Folder selected</EmptyTitle>
                <EmptyDescription>
                  Pick a note inside this folder to edit its contents.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : selectedFile.metadata.type === "draw" ? (
          <div className="h-full p-6">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FilePenLine />
                </EmptyMedia>
                <EmptyTitle>Drawing files are not editable yet</EmptyTitle>
                <EmptyDescription>
                  The notebook architecture is ready for draw files, but the
                  note editor currently focuses on text notes.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : selectedFile.metadata.type === "image" ? (
          <div className="h-full p-6">
            <Empty className="h-full border-border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FileImage />
                </EmptyMedia>
                <EmptyTitle>Image files are not editable yet</EmptyTitle>
                <EmptyDescription>
                  Use note files for writing today; image-specific editing can
                  be layered onto this file system next.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="h-full flex flex-col">
            <NavBar
              notebookId={selectedNotebook.id}
              notebookName={selectedNotebook.name}
              files={notebookFiles}
              activeFileId={selectedFile.id}
            />

            <Editor
              mode="markdown"
              content={draftContent}
              onEditorMetaChange={(meta) => {
                cursorMetaRef.current = meta;
                setFooterField(
                  "logits-footer-tabsize",
                  `Spaces: ${meta.tabSize}`,
                );
                updateFooterCursor(meta);
              }}
              onContentChange={(newContent) => {
                if (!selectedFile?.id) return;

                updateFooterStats(newContent);
                setFooterField("logits-footer-save-status", "Saving");
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

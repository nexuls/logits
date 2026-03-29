"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { T_File } from "@/types/types";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import Footer from "@/components/footer";

function getNotebookTree(files: T_File[]) {
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

export default function Holder({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    notebooks,
    isHydrating,
    updateFileContent,
    getNotebookFiles,
  } = useNotebooks();
  const [draftContent, setDraftContent] = useState("");
  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsForSlug, setLoadedTabsForSlug] = useState<string | null>(null);

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
      .filter((file): file is T_File => Boolean(file));
  }, [openTabIds, openableFiles]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedTabs = window.localStorage.getItem(getNotebookTabStorageKey(slug));

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
      ? openTabIds[openTabIds.length - 1] ?? firstOpenableFile?.id ?? ""
      : openTabIds[openTabIds.length - 1] ?? "";

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
    setDraftContent(selectedFile?.content ?? "");
  }, [selectedFile?.content]);

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

      <main className="h-full w-full flex-1">
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
          <div className="h-full px-6 pb-6 pt-2">
            <div className="mx-auto flex h-full max-w-5xl flex-col rounded-2xl border border-border bg-card/40 p-4 shadow-sm">
              <div className="border-b border-border px-2 pb-3">
                <h1 className="text-xl font-semibold">{selectedFile.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Notes are saved locally as you type.
                </p>
              </div>
              <div className="min-h-0 flex-1 pt-4">
                <Textarea
                  value={draftContent}
                  onChange={(event) => {
                    const nextContent = event.currentTarget.value;
                    setDraftContent(nextContent);
                    void updateFileContent(selectedFile.id, nextContent);
                  }}
                  placeholder="Start writing..."
                  className="h-full min-h-[60dvh] resize-none border-0 bg-transparent px-2 text-base leading-7 shadow-none focus-visible:ring-0"
                />
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

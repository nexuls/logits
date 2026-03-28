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

function getNotebookTree(files: T_File[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder) {
      return first.metadata.fileOrder - second.metadata.fileOrder;
    }

    return first.name.localeCompare(second.name);
  });
}

export default function Holder({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    notebooks,
    isHydrating,
    renameNotebook,
    renameFile,
    updateFileContent,
    getNotebookFiles,
  } = useNotebooks();
  const [draftContent, setDraftContent] = useState("");

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
  const firstOpenableFile = useMemo(
    () =>
      getNotebookTree(notebookFiles).find(
        (file) => file.metadata.type !== "folder",
      ) ?? null,
    [notebookFiles],
  );

  useEffect(() => {
    if (!selectedNotebook || selectedFile || !firstOpenableFile) {
      return;
    }

    router.replace(`/p/${selectedNotebook.id}?file=${firstOpenableFile.id}`);
  }, [firstOpenableFile, router, selectedFile, selectedNotebook]);

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

  return (
    <div className="relative h-dvh w-full bg-background">
      <Header
        placeholder={false}
        notebookName={selectedNotebook.name}
        currentFileName={selectedFile?.name}
        onNotebookNameChange={(newName) => {
          void renameNotebook(selectedNotebook.id, newName);
        }}
        onCurrentFileNameChange={(newName) => {
          if (!selectedFile) {
            return;
          }

          void renameFile(selectedFile.id, newName);
        }}
      />
      <main className="h-full w-full pt-16">
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
          <div className="h-full px-6 pb-6">
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
    </div>
  );
}

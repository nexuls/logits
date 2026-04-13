"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type ReactNode,
} from "react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { AppFile, FileType } from "@/data/modules/notebook/client-types";
import { useNotebooks } from "@/hooks/use-notebooks";
import { buildNotebookUrl } from "@/lib/notebook-url";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  FileTreeActions,
  FileTreeActionsContextMenu,
} from "./file-tree-actions";
import { FileTreeNode } from "./file-tree-node";
import { NotebookSettingsDialog } from "../notebook-settings-dialog";
import {
  getDescendantIds,
  getTreeDropPosition,
  type FileTreeDropPosition,
  sortChildren,
} from "./file-tree-utils";

type Props = {
  notebookId: string;
  files: AppFile[];
  activeFileId?: string;
};

type DropTarget = {
  parentId: string;
  index: number;
  position: FileTreeDropPosition | "root";
  targetId: string | null;
};

export function FileTree({ notebookId, files, activeFileId }: Props) {
  const router = useRouter();
  const {
    notebooks,
    createFile,
    renameFile,
    deleteFile,
    duplicateFile,
    moveFile,
    renameNotebook,
    deleteNotebook,
  } = useNotebooks();
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [query, setQuery] = useState("");
  const [isNotebookSettingsOpen, setIsNotebookSettingsOpen] = useState(false);
  const [draftNotebookName, setDraftNotebookName] = useState("");
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === notebookId) ?? null;

  const filesByParent = useMemo(() => {
    const mapping = new Map<string, AppFile[]>();

    for (const file of files) {
      const current = mapping.get(file.metadata.parentId) ?? [];
      current.push(file);
      mapping.set(file.metadata.parentId, current);
    }

    return mapping;
  }, [files]);

  const filesById = useMemo(() => {
    return new Map(files.map((file) => [file.id, file]));
  }, [files]);

  const activeFolderPathIds = useMemo(() => {
    const openFolderIds = new Set<string>();

    if (!activeFileId) return openFolderIds;

    let currentFile = filesById.get(activeFileId);

    while (currentFile) {
      if (currentFile.metadata.type === "folder")
        openFolderIds.add(currentFile.id);

      if (currentFile.metadata.parentId === notebookId) break;

      currentFile = filesById.get(currentFile.metadata.parentId);
    }

    return openFolderIds;
  }, [activeFileId, filesById, notebookId]);

  useEffect(() => {
    setCollapsedFolders((currentState) => {
      const nextState: Record<string, boolean> = {};

      for (const file of files) {
        if (file.metadata.type !== "folder") continue;

        const existingValue = currentState[file.id];
        nextState[file.id] = existingValue === undefined ? true : existingValue;
      }

      for (const folderId of activeFolderPathIds) {
        if (nextState[folderId] !== undefined) {
          nextState[folderId] = false;
        }
      }

      const currentFolderIds = Object.keys(currentState);
      const nextFolderIds = Object.keys(nextState);

      if (currentFolderIds.length !== nextFolderIds.length) return nextState;

      for (const folderId of nextFolderIds) {
        if (currentState[folderId] !== nextState[folderId]) return nextState;
      }

      return currentState;
    });
  }, [activeFolderPathIds, files]);

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (activeNotebook && isNotebookSettingsOpen) {
      setDraftNotebookName(activeNotebook.name);
    }
  }, [activeNotebook, isNotebookSettingsOpen]);

  const clearExpandTimer = () => {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
  };

  const toggleFolder = (fileId: string) => {
    setCollapsedFolders((currentState) => ({
      ...currentState,
      [fileId]: !currentState[fileId],
    }));
  };

  const openFile = (file: AppFile) => {
    if (file.metadata.type === "folder") {
      toggleFolder(file.id);
      return;
    }

    router.push(buildNotebookUrl(notebookId, { fileId: file.id }));
  };

  const handleCreate = async (
    parentId: string,
    type: FileType,
    name?: string,
  ) => {
    const createdFile = await createFile({ notebookId, parentId, type, name });

    if (!createdFile) {
      toast.error("Could not create item");
      return;
    }

    if (type === "folder") {
      setCollapsedFolders((currentState) => ({
        ...currentState,
        [createdFile.id]: false,
        [parentId]: false,
      }));
      startRename(createdFile);
      toast.success("Folder created");
      return;
    }

    startRename(createdFile);
    toast.success("File created");
    router.push(buildNotebookUrl(notebookId, { fileId: createdFile.id }));
  };

  const handleRenameNotebook = async () => {
    if (!activeNotebook) {
      return;
    }

    const nextName = draftNotebookName.trim();

    if (!nextName || nextName === activeNotebook.name) {
      setIsNotebookSettingsOpen(false);
      return;
    }

    await renameNotebook(activeNotebook.id, nextName);
    setIsNotebookSettingsOpen(false);
  };

  const handleDeleteNotebook = async () => {
    if (!activeNotebook) {
      return;
    }

    const fallbackNotebook = await deleteNotebook(activeNotebook.id);
    setIsNotebookSettingsOpen(false);

    if (fallbackNotebook) {
      router.push(buildNotebookUrl(fallbackNotebook.id));
      return;
    }

    router.push("/");
  };

  const startRename = (file: AppFile) => {
    setRenameFileId(file.id);
    setRenameValue(file.name);
  };

  const cancelRename = () => {
    setRenameFileId(null);
    setRenameValue("");
  };

  const commitRename = async () => {
    if (!renameFileId) {
      return;
    }

    const nextName = renameValue.trim();

    if (!nextName) {
      toast.error("Name cannot be empty");
      return;
    }

    await renameFile(renameFileId, nextName);
    cancelRename();
    toast.success("Renamed");
  };

  const onDuplicate = async (file: AppFile) => {
    const duplicatedFile = await duplicateFile(file.id);

    if (!duplicatedFile) {
      toast.error("Could not duplicate item");
      return;
    }

    toast.success("Duplicated");

    if (duplicatedFile.metadata.type !== "folder") {
      router.push(buildNotebookUrl(notebookId, { fileId: duplicatedFile.id }));
    }
  };

  const onDelete = async (file: AppFile) => {
    await deleteFile(file.id);
    toast.success("Deleted");

    if (activeFileId === file.id) {
      router.push(buildNotebookUrl(notebookId));
    }
  };

  const copyLink = async (file: AppFile) => {
    if (typeof window === "undefined") {
      return;
    }

    const fileUrl = new URL(
      buildNotebookUrl(notebookId, { fileId: file.id }),
      window.location.origin,
    ).toString();
    await navigator.clipboard.writeText(fileUrl);
    toast.success("Link copied");
  };

  const resolveDropTarget = (
    targetFile: AppFile,
    position: FileTreeDropPosition,
  ) => {
    if (position === "inside" && targetFile.metadata.type === "folder") {
      const children = sortChildren(filesByParent.get(targetFile.id) ?? []);
      return {
        parentId: targetFile.id,
        index: children.length,
      };
    }

    const siblings = sortChildren(
      filesByParent.get(targetFile.metadata.parentId) ?? [],
    );
    const targetIndex = siblings.findIndex(
      (candidate) => candidate.id === targetFile.id,
    );

    return {
      parentId: targetFile.metadata.parentId,
      index: position === "before" ? targetIndex : targetIndex + 1,
    };
  };

  const canDropOnTarget = (
    targetFile: AppFile,
    position: FileTreeDropPosition,
  ) => {
    if (!draggingFileId || draggingFileId === targetFile.id) {
      return false;
    }

    const draggingFile = filesById.get(draggingFileId);

    if (!draggingFile) {
      return false;
    }

    const nextTarget = resolveDropTarget(targetFile, position);

    if (nextTarget.parentId === draggingFile.id) {
      return false;
    }

    if (
      draggingFile.metadata.type === "folder" &&
      getDescendantIds(files, draggingFile.id).has(nextTarget.parentId)
    ) {
      return false;
    }

    return true;
  };

  const setFolderExpandIntent = (
    targetFile: AppFile,
    position: FileTreeDropPosition,
  ) => {
    clearExpandTimer();

    if (
      targetFile.metadata.type !== "folder" ||
      position !== "inside" ||
      !collapsedFolders[targetFile.id]
    ) {
      return;
    }

    expandTimeoutRef.current = setTimeout(() => {
      setCollapsedFolders((currentState) => ({
        ...currentState,
        [targetFile.id]: false,
      }));
    }, 700);
  };

  const handleDragStart = (fileId: string) => {
    setDraggingFileId(fileId);
    setDropTarget(null);
  };

  const handleDragHover = (
    targetFile: AppFile,
    event: DragEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const position = getTreeDropPosition(
      event.clientY,
      event.currentTarget.getBoundingClientRect(),
      targetFile.metadata.type === "folder",
    );

    if (!canDropOnTarget(targetFile, position)) {
      clearExpandTimer();
      setDropTarget(null);
      return;
    }

    const nextTarget = resolveDropTarget(targetFile, position);

    setDropTarget({
      parentId: nextTarget.parentId,
      index: nextTarget.index,
      position,
      targetId: targetFile.id,
    });
    setFolderExpandIntent(targetFile, position);
  };

  const handleDrop = async (targetFile: AppFile) => {
    if (
      !dropTarget ||
      !draggingFileId ||
      dropTarget.targetId !== targetFile.id
    ) {
      return;
    }

    await moveFile(draggingFileId, dropTarget.parentId, dropTarget.index);
    clearExpandTimer();
    setDraggingFileId(null);
    setDropTarget(null);
  };

  const handleDragEnd = () => {
    clearExpandTimer();
    setDraggingFileId(null);
    setDropTarget(null);
  };

  const handleRootDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!draggingFileId) {
      return;
    }

    const rootItems = sortChildren(filesByParent.get(notebookId) ?? []);

    setDropTarget({
      parentId: notebookId,
      index: rootItems.length,
      position: "root",
      targetId: null,
    });
  };

  const handleRootDrop = async (event: DragEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (!draggingFileId || !dropTarget || dropTarget.position !== "root") {
      return;
    }

    await moveFile(draggingFileId, notebookId, dropTarget.index);
    handleDragEnd();
  };

  const visibleFileIds = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return null;
    }

    const visibleIds = new Set<string>();

    for (const file of files) {
      if (!file.name.toLowerCase().includes(normalizedQuery)) {
        continue;
      }

      let currentFile: AppFile | undefined = file;

      while (currentFile) {
        visibleIds.add(currentFile.id);

        if (currentFile.metadata.parentId === notebookId) {
          break;
        }

        currentFile = filesById.get(currentFile.metadata.parentId);
      }
    }

    return visibleIds;
  }, [files, filesById, notebookId, query]);

  const renderBranch = (parentId: string, depth = 0): ReactNode => {
    const children = sortChildren(filesByParent.get(parentId) ?? []);
    const visibleChildren = visibleFileIds
      ? children.filter((file) => visibleFileIds.has(file.id))
      : children;

    if (!visibleChildren.length) {
      return null;
    }

    return (
      <div className="space-y-0.5">
        {visibleChildren.map((file) => (
          <FileTreeNode
            key={file.id}
            file={file}
            depth={depth}
            isActive={activeFileId === file.id}
            isCollapsed={collapsedFolders[file.id]}
            isDragging={draggingFileId === file.id}
            isRenaming={renameFileId === file.id}
            renameValue={renameValue}
            dropPosition={
              dropTarget?.targetId === file.id && dropTarget.position !== "root"
                ? dropTarget.position
                : null
            }
            onActivate={openFile}
            onRenameValueChange={setRenameValue}
            onCommitRename={() => {
              void commitRename();
            }}
            onCancelRename={cancelRename}
            onStartRename={startRename}
            onCreate={(targetParentId, type) => {
              void handleCreate(targetParentId, type);
            }}
            onCopyLink={(fileToCopy) => {
              void copyLink(fileToCopy);
            }}
            onDuplicate={(fileToDuplicate) => {
              void onDuplicate(fileToDuplicate);
            }}
            onDelete={(fileToDelete) => {
              void onDelete(fileToDelete);
            }}
            onDragStart={handleDragStart}
            onDragHover={handleDragHover}
            onDrop={(targetFile) => {
              void handleDrop(targetFile);
            }}
            onDragEnd={handleDragEnd}
          >
            {renderBranch(file.id, depth + 1)}
          </FileTreeNode>
        ))}
      </div>
    );
  };

  const renderedTree = renderBranch(notebookId);

  const openNotebookSettings = () => {
    if (!activeNotebook) {
      return;
    }

    setDraftNotebookName(activeNotebook.name);
    setIsNotebookSettingsOpen(true);
  };

  return (
    <>
      <FileTreeActionsContextMenu
        notebookId={notebookId}
        hasActiveNotebook={Boolean(activeNotebook)}
        onCreate={(parentId, type) => {
          void handleCreate(parentId, type);
        }}
        onOpenNotebookSettings={openNotebookSettings}
      >
        <div className="flex h-full min-h-0 flex-col gap-3">
          <div className="flex items-center gap-2 px-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search files..."
                className="h-9 rounded-lg border-sidebar-border bg-sidebar/60 pl-9"
              />
            </div>

            <FileTreeActions
              notebookId={notebookId}
              hasActiveNotebook={Boolean(activeNotebook)}
              onCreate={(parentId, type) => {
                void handleCreate(parentId, type);
              }}
              onOpenNotebookSettings={openNotebookSettings}
            />
          </div>

          <ScrollArea className="min-h-0 flex-1 [&>div>div]:block!">
            <div
              className="min-w-0 px-1"
              onDragOver={handleRootDragOver}
              onDrop={(event) => {
                void handleRootDrop(event);
              }}
            >
              {renderedTree}

              {query.trim() && !renderedTree ? (
                <div className="px-3 py-6 text-sm text-muted-foreground">
                  No files found.
                </div>
              ) : null}

              {draggingFileId ? (
                <div
                  className={[
                    "mt-2 w-full rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground transition-colors",
                    dropTarget?.position === "root"
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-sidebar-border",
                  ].join(" ")}
                >
                  Drop here to move to notebook root
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>
      </FileTreeActionsContextMenu>

      <NotebookSettingsDialog
        mode="edit"
        open={isNotebookSettingsOpen}
        notebookName={activeNotebook?.name ?? "this notebook"}
        draftName={draftNotebookName}
        deleteDisabled={notebooks.length <= 1}
        onDraftNameChange={setDraftNotebookName}
        onOpenChange={setIsNotebookSettingsOpen}
        onDelete={() => {
          void handleDeleteNotebook();
        }}
        onSubmit={() => {
          void handleRenameNotebook();
        }}
      />
    </>
  );
}

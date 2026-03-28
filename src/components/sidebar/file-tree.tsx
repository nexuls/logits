"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CopyPlus,
  Download,
  EllipsisVertical,
  FileImage,
  FilePenLine,
  FileText,
  Folder,
  FolderPlus,
  Link2,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { T_File, T_File_Type } from "@/types/types";
import { cn } from "@/lib/utils";
import { useNotebooks } from "@/hooks/use-notebooks";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";

type Props = {
  notebookId: string;
  files: T_File[];
  activeFileId?: string;
};

function sortChildren(files: T_File[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder) {
      return first.metadata.fileOrder - second.metadata.fileOrder;
    }

    if (first.metadata.type === "folder" && second.metadata.type !== "folder") {
      return -1;
    }

    if (first.metadata.type !== "folder" && second.metadata.type === "folder") {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });
}

function getFileIcon(type: T_File_Type) {
  if (type === "folder") {
    return Folder;
  }

  if (type === "draw") {
    return FilePenLine;
  }

  if (type === "image") {
    return FileImage;
  }

  return FileText;
}

export function FileTree({ notebookId, files, activeFileId }: Props) {
  const router = useRouter();
  const { createFile, renameFile, deleteFile, duplicateFile, reorderFiles } =
    useNotebooks();
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [renameFileId, setRenameFileId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const filesByParent = useMemo(() => {
    const mapping = new Map<string, T_File[]>();

    for (const file of files) {
      const current = mapping.get(file.metadata.parentId) ?? [];
      current.push(file);
      mapping.set(file.metadata.parentId, current);
    }

    return mapping;
  }, [files]);

  useEffect(() => {
    setCollapsedFolders((currentState) => {
      const nextState = { ...currentState };

      for (const file of files) {
        if (file.metadata.type === "folder" && nextState[file.id] == null) {
          nextState[file.id] = false;
        }
      }

      return nextState;
    });
  }, [files]);

  const openFile = (file: T_File) => {
    if (file.metadata.type === "folder") {
      setCollapsedFolders((currentState) => ({
        ...currentState,
        [file.id]: !currentState[file.id],
      }));
      return;
    }

    router.push(`/p/${notebookId}?file=${file.id}`);
  };

  const handleCreate = async (
    parentId: string,
    type: T_File_Type,
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
      }));
      toast.success("Folder created");
      return;
    }

    toast.success("File created");
    router.push(`/p/${notebookId}?file=${createdFile.id}`);
  };

  const startRename = (file: T_File) => {
    setRenameFileId(file.id);
    setRenameValue(file.name);
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
    setRenameFileId(null);
    setRenameValue("");
    toast.success("Renamed");
  };

  const onDuplicate = async (file: T_File) => {
    const duplicatedFile = await duplicateFile(file.id);

    if (!duplicatedFile) {
      toast.error("Could not duplicate item");
      return;
    }

    toast.success("Duplicated");

    if (duplicatedFile.metadata.type !== "folder") {
      router.push(`/p/${notebookId}?file=${duplicatedFile.id}`);
    }
  };

  const onDelete = async (file: T_File) => {
    await deleteFile(file.id);
    toast.success("Deleted");

    if (activeFileId === file.id) {
      router.push(`/p/${notebookId}`);
    }
  };

  const copyLink = async (file: T_File) => {
    if (typeof window === "undefined") {
      return;
    }

    const fileUrl = `${window.location.origin}/p/${notebookId}?file=${file.id}`;
    await navigator.clipboard.writeText(fileUrl);
    toast.success("Link copied");
  };

  const renderBranch = (parentId: string, depth = 0) => {
    const children = sortChildren(filesByParent.get(parentId) ?? []);

    if (!children.length) {
      return null;
    }

    return (
      <div className="space-y-0.5">
        {children.map((file) => {
          const Icon = getFileIcon(file.metadata.type);
          const isFolder = file.metadata.type === "folder";
          const isCollapsed = collapsedFolders[file.id];
          const isDragging = draggingFileId === file.id;
          const isRenaming = renameFileId === file.id;

          return (
            <div key={file.id}>
              <div
                draggable
                onDragStart={() => {
                  setDraggingFileId(file.id);
                }}
                onDragOver={(event) => {
                  const draggingFile = files.find(
                    (candidate) => candidate.id === draggingFileId,
                  );

                  if (
                    !draggingFile ||
                    draggingFile.metadata.parentId !== file.metadata.parentId
                  ) {
                    return;
                  }

                  event.preventDefault();
                }}
                onDrop={(event) => {
                  event.preventDefault();

                  if (!draggingFileId || draggingFileId === file.id) {
                    return;
                  }

                  const siblings = sortChildren(
                    filesByParent.get(file.metadata.parentId) ?? [],
                  );
                  const draggingFile = siblings.find(
                    (candidate) => candidate.id === draggingFileId,
                  );

                  if (!draggingFile) {
                    return;
                  }

                  const nextIds = siblings.map((candidate) => candidate.id);
                  const fromIndex = nextIds.indexOf(draggingFileId);
                  const toIndex = nextIds.indexOf(file.id);

                  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
                    return;
                  }

                  nextIds.splice(fromIndex, 1);
                  nextIds.splice(toIndex, 0, draggingFileId);
                  void reorderFiles(file.metadata.parentId, nextIds);
                  setDraggingFileId(null);
                }}
                onDragEnd={() => {
                  setDraggingFileId(null);
                }}
                className={cn(
                  "group flex items-center gap-1 rounded-md px-2 py-1 text-sm",
                  activeFileId === file.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                  isDragging && "opacity-50",
                )}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
              >
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent"
                  onClick={() => {
                    if (!isFolder) {
                      return;
                    }

                    setCollapsedFolders((currentState) => ({
                      ...currentState,
                      [file.id]: !currentState[file.id],
                    }));
                  }}
                >
                  {isFolder ? (
                    isCollapsed ? (
                      <ChevronRight className="size-4" />
                    ) : (
                      <ChevronDown className="size-4" />
                    )
                  ) : null}
                </button>

                <button
                  type="button"
                  onClick={() => openFile(file)}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-sidebar-accent/50"
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  {isRenaming ? (
                    <Input
                      value={renameValue}
                      onChange={(event) =>
                        setRenameValue(event.currentTarget.value)
                      }
                      onBlur={() => {
                        void commitRename();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void commitRename();
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          setRenameFileId(null);
                          setRenameValue("");
                        }
                      }}
                      autoFocus
                      className="h-7"
                    />
                  ) : (
                    <span className="truncate">{file.name}</span>
                  )}
                </button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="size-6 opacity-0 group-hover:opacity-100"
                    >
                      <EllipsisVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    {isFolder ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleCreate(file.id, "file");
                          }}
                        >
                          <Plus className="size-4" />
                          New note
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            void handleCreate(file.id, "folder");
                          }}
                        >
                          <FolderPlus className="size-4" />
                          New folder
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                      </>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() => {
                        void copyLink(file);
                      }}
                    >
                      <Link2 className="size-4" />
                      Copy link
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => startRename(file)}>
                      <Pencil className="size-4" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        void onDuplicate(file);
                      }}
                    >
                      <CopyPlus className="size-4" />
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      <Download className="size-4" />
                      Download
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled>
                      <Pin className="size-4" />
                      Pin file
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        void onDelete(file);
                      }}
                    >
                      <Trash2 className="size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {isFolder && !isCollapsed
                ? renderBranch(file.id, depth + 1)
                : null}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 px-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void handleCreate(notebookId, "file");
          }}
        >
          <Plus className="size-4" />
          New note
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            void handleCreate(notebookId, "folder");
          }}
        >
          <FolderPlus className="size-4" />
          New folder
        </Button>
      </div>

      <div className="px-1">{renderBranch(notebookId)}</div>
    </div>
  );
}

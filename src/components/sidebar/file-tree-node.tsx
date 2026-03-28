"use client";

import { ChevronRight } from "lucide-react";
import {
  useEffect,
  useRef,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { T_File } from "@/types/types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  FileTreeItemActions,
  FileTreeItemContextMenu,
} from "./file-tree-item-actions";
import { type FileTreeDropPosition, getFileIcon } from "./file-tree-utils";

type Props = {
  file: T_File;
  depth: number;
  isActive: boolean;
  isCollapsed: boolean;
  isDragging: boolean;
  isRenaming: boolean;
  renameValue: string;
  dropPosition: FileTreeDropPosition | null;
  onActivate: (file: T_File) => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: (file: T_File) => void;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: T_File) => void;
  onDuplicate: (file: T_File) => void;
  onDelete: (file: T_File) => void;
  onDragStart: (fileId: string) => void;
  onDragHover: (file: T_File, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (file: T_File) => void;
  onDragEnd: () => void;
  children?: ReactNode;
};

export function FileTreeNode({
  file,
  depth,
  isActive,
  isCollapsed,
  isDragging,
  isRenaming,
  renameValue,
  dropPosition,
  onActivate,
  onRenameValueChange,
  onCommitRename,
  onCancelRename,
  onStartRename,
  onCreate,
  onCopyLink,
  onDuplicate,
  onDelete,
  onDragStart,
  onDragHover,
  onDrop,
  onDragEnd,
  children,
}: Props) {
  const isFolder = file.metadata.type === "folder";
  const Icon = getFileIcon(file.metadata.type);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isRenaming || !inputRef.current) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isRenaming]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(file);
    }
  };

  return (
    <div>
      <div className="relative" style={{ paddingLeft: `${depth * 14 + 8}px` }}>
        {dropPosition === "before" ? (
          <div className="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-primary" />
        ) : null}
        {dropPosition === "after" ? (
          <div className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-primary" />
        ) : null}

        <FileTreeItemContextMenu
          file={file}
          onCreate={onCreate}
          onCopyLink={onCopyLink}
          onRename={onStartRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        >
          <div
            draggable={!isRenaming}
            onClick={() => onActivate(file)}
            onKeyDown={onKeyDown}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", file.id);
              onDragStart(file.id);
            }}
            onDragOver={(event) => onDragHover(file, event)}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onDrop(file);
            }}
            onDragEnd={onDragEnd}
            className={cn(
              "group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors hover:transition-none hover:bg-sidebar-accent/50",
              isActive && "bg-sidebar-accent text-sidebar-accent-foreground",
              isDragging && "opacity-50",
              dropPosition === "inside" &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
          >
            <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
              {isFolder ? (
                <ChevronRight
                  className={cn(
                    "size-4 transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                />
              ) : null}
            </span>

            <Icon className="size-4 shrink-0 text-muted-foreground" />

            {isRenaming ? (
              <Input
                ref={inputRef}
                value={renameValue}
                onChange={(event) =>
                  onRenameValueChange(event.currentTarget.value)
                }
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onBlur={onCommitRename}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommitRename();
                  }

                  if (event.key === "Escape") {
                    event.preventDefault();
                    onCancelRename();
                  }
                }}
                className="h-7 flex-1 border-none bg-transparent! px-0 py-0 text-sm shadow-none"
              />
            ) : (
              <span className="min-w-0 flex-1 truncate font-medium">
                {file.name}
              </span>
            )}

            <FileTreeItemActions
              file={file}
              onCreate={onCreate}
              onCopyLink={onCopyLink}
              onRename={onStartRename}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </div>
        </FileTreeItemContextMenu>
      </div>

      {isFolder && !isCollapsed ? children : null}
    </div>
  );
}

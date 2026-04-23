import { ChevronRight } from "lucide-react";
import {
  useEffect,
  useRef,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  FileTreeItemActions,
  FileTreeItemContextMenu,
} from "./file-tree-items-actions";
import { type FileTreeDropPosition, getFileIcon } from "./file-tree-utils";

type Props = {
  file: AppFile;
  depth: number;
  isActive: boolean;
  isCollapsed: boolean;
  isDragging: boolean;
  isRenaming: boolean;
  renameValue: string;
  dropPosition: FileTreeDropPosition | null;
  onActivate: (file: AppFile) => void;
  onRenameValueChange: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
  onStartRename: (file: AppFile) => void;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: AppFile) => void;
  onDuplicate: (file: AppFile) => void;
  onDelete: (file: AppFile) => void;
  onDragStart: (fileId: string) => void;
  onDragHover: (file: AppFile, event: DragEvent<HTMLDivElement>) => void;
  onDrop: (file: AppFile) => void;
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
  const childIndentGuideLeft = depth * 14 + 18;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renameStartedAtRef = useRef(0);
  const blurGuardUntilRef = useRef(0);

  useEffect(() => {
    if (!isRenaming || !inputRef.current) {
      return;
    }

    renameStartedAtRef.current = Date.now();
    blurGuardUntilRef.current = renameStartedAtRef.current + 250;

    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [isRenaming]);

  const scheduleBlurCommit = (event: FocusEvent<HTMLInputElement>) => {
    if (Date.now() < blurGuardUntilRef.current) {
      event.preventDefault();

      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });

      return;
    }

    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }

    const elapsed = Date.now() - renameStartedAtRef.current;
    const delay = Math.max(0, 150 - elapsed);

    blurTimeoutRef.current = setTimeout(() => {
      blurTimeoutRef.current = null;

      if (document.activeElement === inputRef.current) {
        return;
      }

      onCommitRename();
    }, delay);
  };

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate(file);
    }
  };

  return (
    <div>
      <div
        className={cn("relative", {
          "pb-0.5": isFolder && !isCollapsed,
        })}
      >
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
              "group flex items-center gap-2 rounded-md px-2 py-0.5 text-sm outline-none cursor-pointer",
              "transition-colors hover:transition-none hover:bg-sidebar-accent/50",
              "text-muted-foreground/80 hover:text-sidebar-foreground",
              isActive && "bg-sidebar-accent/70 text-sidebar-accent-foreground",
              isDragging && "opacity-50",
              dropPosition === "inside" &&
                "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
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
                onFocus={() => {
                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current);
                    blurTimeoutRef.current = null;
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                }}
                onBlur={scheduleBlurCommit}
                onKeyDown={(event) => {
                  event.stopPropagation();

                  if (blurTimeoutRef.current) {
                    clearTimeout(blurTimeoutRef.current);
                    blurTimeoutRef.current = null;
                  }

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

      {isFolder && !isCollapsed ? (
        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute top-0 bottom-0 border-l border-sidebar-border/70"
            style={{ left: `${childIndentGuideLeft}px` }}
          />
          {children}
        </div>
      ) : null}
    </div>
  );
}

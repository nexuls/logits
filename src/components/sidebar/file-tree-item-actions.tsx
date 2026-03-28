"use client";

import { EllipsisVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { T_File } from "@/types/types";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileTreeActionItems } from "./file-tree-action-items";

type SharedProps = {
  file: T_File;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: T_File) => void;
  onRename: (file: T_File) => void;
  onDuplicate: (file: T_File) => void;
  onDelete: (file: T_File) => void;
};

type ContextProps = SharedProps & {
  children: ReactNode;
};

export function FileTreeItemContextMenu({ children, ...props }: ContextProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-44">
        <FileTreeActionItems
          {...props}
          Item={ContextMenuItem}
          Separator={ContextMenuSeparator}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileTreeItemActions(props: SharedProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          className="size-7 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sidebar-accent hover:text-foreground"
          aria-label={`${props.file.name} actions`}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onPointerDown={(event) => {
            event.stopPropagation();
          }}
        >
          <EllipsisVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-44"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onPointerDown={(event) => {
          event.stopPropagation();
        }}
      >
        <FileTreeActionItems
          {...props}
          Item={DropdownMenuItem}
          Separator={DropdownMenuSeparator}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

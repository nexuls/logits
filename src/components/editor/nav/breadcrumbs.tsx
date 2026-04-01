"use client";

import { useMemo } from "react";
import { ChevronDown, FolderOpen } from "lucide-react";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getFileIcon,
  sortChildren,
} from "@/components/sidebar/file-tree-utils";

type Props = {
  notebookId: string;
  notebookName: string;
  files: AppFile[];
  activeFileId?: string;
  onNavigateToFile: (fileId: string) => void;
};

type BreadcrumbSegment = {
  file: AppFile;
  isCurrent: boolean;
  hasDropdown: boolean;
};

type FolderMenuItemsProps = {
  folderId: string;
  filesByParent: Map<string, AppFile[]>;
  onNavigate: (fileId: string) => void;
};

function FolderMenuItems({ folderId, filesByParent, onNavigate }: FolderMenuItemsProps) {
  const children = sortChildren(filesByParent.get(folderId) ?? []);

  if (children.length === 0) {
    return <DropdownMenuItem disabled>Empty</DropdownMenuItem>;
  }

  return (
    <>
      {children.map((child) => {
        const ChildIcon = getFileIcon(child.metadata.type);
        const childChildren = sortChildren(filesByParent.get(child.id) ?? []);
        const hasChildren =
          child.metadata.type === "folder" && childChildren.length > 0;

        if (hasChildren) {
          return (
            <DropdownMenuSub key={child.id}>
              <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-1">
                <ChildIcon className="size-3.5" />
                <span className="truncate text-xs">{child.name}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-80 min-w-56 overflow-y-auto">
                <FolderMenuItems
                  folderId={child.id}
                  filesByParent={filesByParent}
                  onNavigate={onNavigate}
                />
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          );
        }

        return (
          <DropdownMenuItem
            key={child.id}
            onSelect={() => onNavigate(child.id)}
            className="cursor-pointer"
          >
            <ChildIcon className="size-3.5" />
            <span className="truncate text-xs">{child.name}</span>
          </DropdownMenuItem>
        );
      })}
    </>
  );
}

export function NotebookBreadcrumbs({
  notebookId,
  notebookName,
  files,
  activeFileId,
  onNavigateToFile,
}: Props) {
  const filesById = useMemo(() => new Map(files.map((file) => [file.id, file])), [files]);

  const filesByParent = useMemo(() => {
    const mapping = new Map<string, AppFile[]>();

    for (const file of files) {
      const current = mapping.get(file.metadata.parentId) ?? [];
      current.push(file);
      mapping.set(file.metadata.parentId, current);
    }

    return mapping;
  }, [files]);

  const breadcrumbSegments = useMemo(() => {
    if (!activeFileId) {
      return [] as BreadcrumbSegment[];
    }

    const activeFile = filesById.get(activeFileId);

    if (!activeFile) {
      return [] as BreadcrumbSegment[];
    }

    const chain: AppFile[] = [activeFile];
    let parentId = activeFile.metadata.parentId;

    while (parentId !== notebookId) {
      const parent = filesById.get(parentId);

      if (!parent) {
        break;
      }

      chain.push(parent);
      parentId = parent.metadata.parentId;
    }

    chain.reverse();

    return chain.map((file, index) => {
      const isCurrent = index === chain.length - 1;

      return {
        file,
        isCurrent,
        hasDropdown: !isCurrent && file.metadata.type === "folder",
      };
    });
  }, [activeFileId, filesById, notebookId]);

  return (
    <div className="min-w-0 flex-1">
      <Breadcrumb>
        <BreadcrumbList className="flex-nowrap gap-1 sm:gap-1">
          <BreadcrumbItem className="shrink-0 gap-1">
            <BreadcrumbPage className="max-w-72 truncate text-xs">
              {notebookName}
            </BreadcrumbPage>
          </BreadcrumbItem>

          {breadcrumbSegments.map((segment) => (
            <div key={segment.file.id} className="flex items-center gap-1">
              <BreadcrumbSeparator />
              <BreadcrumbItem className="shrink-0 gap-1">
                {segment.hasDropdown ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="link"
                        size="xs"
                        className="h-6 max-w-52 gap-1 px-0! text-muted-foreground hover:text-foreground data-[state=open]:text-foreground"
                      >
                        <FolderOpen className="size-3.5 shrink-0" />
                        <span className="truncate">{segment.file.name}</span>
                        <ChevronDown className="size-3.5 shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-80 min-w-56 overflow-y-auto"
                    >
                      <FolderMenuItems
                        folderId={segment.file.id}
                        filesByParent={filesByParent}
                        onNavigate={onNavigateToFile}
                      />
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : segment.isCurrent ? (
                  <BreadcrumbPage className="max-w-72 truncate text-xs">
                    {segment.file.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink
                    className="max-w-52 truncate text-xs"
                    onClick={() => onNavigateToFile(segment.file.id)}
                  >
                    {segment.file.name}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </div>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
/* biome-ignore-all lint/a11y: sortable drag rows intentionally use draggable div interactions */
"use client";

import { useEffect, useState } from "react";
import {
  BoxIcon,
  Check,
  EllipsisVertical,
  GripVertical,
  LayoutGrid,
  PenLine,
  Plus,
  SquarePen,
} from "lucide-react";

import type { T_Page_Meta } from "@/types/types";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type Props = {
  pages: T_Page_Meta[];
  currentPageId: string;
  onCurrentPageIdChange?: (pageId: string) => void;
  onPagesChange?: (pages: T_Page_Meta[]) => void;
};

const pageTypeIcons = {
  canvas: BoxIcon,
  gallery: LayoutGrid,
} as const;

function reorderPages(pages: T_Page_Meta[], fromId: string, toId: string) {
  const fromIndex = pages.findIndex((page) => page.id === fromId);
  const toIndex = pages.findIndex((page) => page.id === toId);

  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return pages;
  }

  const nextPages = [...pages];
  const [movedPage] = nextPages.splice(fromIndex, 1);
  nextPages.splice(toIndex, 0, movedPage);

  return nextPages;
}

export default function PageDropdown({
  pages,
  currentPageId,
  onCurrentPageIdChange,
  onPagesChange,
}: Props) {
  const [isSorting, setIsSorting] = useState(false);
  const [orderedPages, setOrderedPages] = useState<T_Page_Meta[]>(pages);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const currentPage =
    orderedPages.find((page) => page.id === currentPageId) || orderedPages[0];
  const CurrentPageIcon = currentPage ? pageTypeIcons[currentPage.type] : SquarePen;

  const currentPageName =
    currentPage?.name || "Page";

  useEffect(() => {
    setOrderedPages(pages);
  }, [pages]);

  const applyReorder = (fromId: string, toId: string) => {
    const nextPages = reorderPages(orderedPages, fromId, toId);

    if (nextPages === orderedPages) return;

    setOrderedPages(nextPages);
    onPagesChange?.(nextPages);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="px-2">
          <CurrentPageIcon className="size-4 text-muted-foreground" />
          {currentPageName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52 p-0">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-sm font-medium">Pages</span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              className="size-6"
              onClick={() => setIsSorting((prevValue) => !prevValue)}
            >
              {isSorting ? <Check /> : <PenLine />}
            </Button>
            <Button variant="ghost" size="icon-xs" className="size-6">
              <Plus />
            </Button>
          </div>
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />

        {isSorting ? (
          <div className="p-1">
            {orderedPages.map((page) => {
              const isCurrentPage = page.id === currentPageId;
              const isDropTarget = page.id === dropTargetPageId;
              const PageTypeIcon = pageTypeIcons[page.type];

              return (
                <div
                  key={page.id}
                  draggable
                  className={cn(
                    "flex h-8 items-center justify-between rounded-sm px-2 text-sm",
                    "cursor-grab select-none active:cursor-grabbing",
                    isCurrentPage && "bg-accent text-accent-foreground",
                    isDropTarget && "ring-1 ring-ring",
                  )}
                  onDragStart={() => {
                    setDraggingPageId(page.id);
                    setDropTargetPageId(page.id);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDropTargetPageId(page.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();

                    if (!draggingPageId) return;

                    applyReorder(draggingPageId, page.id);
                    setDraggingPageId(null);
                    setDropTargetPageId(null);
                  }}
                  onDragEnd={() => {
                    setDraggingPageId(null);
                    setDropTargetPageId(null);
                  }}
                >
                  <div className="flex items-center gap-2">
                    <GripVertical className="size-3.5 text-muted-foreground" />
                    <PageTypeIcon className="size-3.5 text-muted-foreground" />
                    <span>{page.name}</span>
                  </div>
                  {isCurrentPage ? (
                    <EllipsisVertical className="size-4 text-muted-foreground" />
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-1">
            {orderedPages.map((page) => {
              const isCurrentPage = page.id === currentPageId;
              const PageTypeIcon = pageTypeIcons[page.type];

              return (
                <DropdownMenuItem
                  key={page.id}
                  className={cn(
                    "h-8 px-2",
                    isCurrentPage && "bg-accent text-accent-foreground",
                  )}
                  onSelect={() => onCurrentPageIdChange?.(page.id)}
                >
                  <div className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Check
                        className={cn(
                          "size-3.5",
                          isCurrentPage ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <PageTypeIcon className="size-3.5 text-muted-foreground" />
                      <span>{page.name}</span>
                    </div>
                    {isCurrentPage ? (
                      <EllipsisVertical className="size-4 text-muted-foreground" />
                    ) : null}
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  Pencil,
  Plus,
  SquarePen,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "../ui/popover";
import { ToggleGroup, ToggleGroupItem } from "../ui/toggle-group";

type Props = {
  pages: T_Page_Meta[];
  currentPageId: string;
  onCurrentPageIdChange?: (pageId: string) => void;
  onPagesChange?: (pages: T_Page_Meta[]) => void;
  renameCurrentPageSignal?: number;
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
  renameCurrentPageSignal,
}: Props) {
  const [isSorting, setIsSorting] = useState(false);
  const [orderedPages, setOrderedPages] = useState<T_Page_Meta[]>(pages);
  const [draggingPageId, setDraggingPageId] = useState<string | null>(null);
  const [dropTargetPageId, setDropTargetPageId] = useState<string | null>(null);
  const [renamePageId, setRenamePageId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deletePageId, setDeletePageId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createType, setCreateType] = useState<T_Page_Meta["type"]>("canvas");
  const currentPage =
    orderedPages.find((page) => page.id === currentPageId) || orderedPages[0];
  const CurrentPageIcon = currentPage
    ? pageTypeIcons[currentPage.type]
    : SquarePen;

  const currentPageName = currentPage?.name || "Page";

  useEffect(() => {
    setOrderedPages(pages);
  }, [pages]);

  useEffect(() => {
    if (!renameCurrentPageSignal || !currentPage) {
      return;
    }

    setRenamePageId(currentPage.id);
    setRenameValue(currentPage.name);
  }, [renameCurrentPageSignal, currentPage]);

  const applyReorder = (fromId: string, toId: string) => {
    const nextPages = reorderPages(orderedPages, fromId, toId);

    if (nextPages === orderedPages) return;

    setOrderedPages(nextPages);
    onPagesChange?.(nextPages);
  };

  const applyPages = (nextPages: T_Page_Meta[]) => {
    setOrderedPages(nextPages);
    onPagesChange?.(nextPages);
  };

  const openCreatePage = () => {
    const nextIndex = orderedPages.length + 1;
    setCreateName(`Page ${nextIndex}`);
    setCreateType("canvas");
    setIsCreateDialogOpen(true);
  };

  const createPage = () => {
    const nextName = createName.trim();

    if (!nextName) {
      toast.error("Page name cannot be empty");
      return;
    }

    const nextPage: T_Page_Meta = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      name: nextName,
      type: createType,
    };

    const nextPages = [...orderedPages, nextPage];
    applyPages(nextPages);
    onCurrentPageIdChange?.(nextPage.id);
    setIsCreateDialogOpen(false);
    setCreateName("");
    setCreateType("canvas");
    toast.success("Page created");
  };

  const openRenamePage = (pageId: string) => {
    const targetPage = orderedPages.find((page) => page.id === pageId);

    if (!targetPage) {
      return;
    }

    setRenamePageId(pageId);
    setRenameValue(targetPage.name);
  };

  const commitRenamePage = () => {
    if (!renamePageId) {
      return;
    }

    const nextName = renameValue.trim();

    if (!nextName) {
      toast.error("Page name cannot be empty");
      return;
    }

    const nextPages = orderedPages.map((page) =>
      page.id === renamePageId ? { ...page, name: nextName } : page,
    );

    applyPages(nextPages);
    setRenamePageId(null);
    setRenameValue("");
    toast.success("Page renamed");
  };

  const confirmDeletePage = () => {
    if (!deletePageId) {
      return;
    }

    const targetIndex = orderedPages.findIndex(
      (page) => page.id === deletePageId,
    );

    if (targetIndex < 0) {
      setDeletePageId(null);
      return;
    }

    const nextPages = orderedPages.filter((page) => page.id !== deletePageId);
    applyPages(nextPages);

    if (currentPageId === deletePageId) {
      const fallbackPage = nextPages[targetIndex] ?? nextPages[targetIndex - 1];
      onCurrentPageIdChange?.(fallbackPage?.id ?? "");
    }

    setDeletePageId(null);
    toast.success("Page deleted");
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
            <Popover open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="size-6"
                  onClick={openCreatePage}
                >
                  <Plus />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" side="bottom" className="w-72">
                <PopoverHeader>
                  <PopoverTitle>Create page</PopoverTitle>
                  <PopoverDescription>Set page name and type.</PopoverDescription>
                </PopoverHeader>
                <div className="mt-3 flex flex-col gap-3">
                  <Input
                    value={createName}
                    onChange={(event) => setCreateName(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        createPage();
                      }
                    }}
                    autoFocus
                    aria-label="Page name"
                  />
                  <ToggleGroup
                    type="single"
                    value={createType}
                    onValueChange={(value) => {
                      if (!value) {
                        return;
                      }

                      setCreateType(value as T_Page_Meta["type"]);
                    }}
                    variant="outline"
                    className="w-full"
                  >
                    <ToggleGroupItem
                      value="canvas"
                      className="flex-1 justify-center gap-2"
                    >
                      <BoxIcon className="size-4" />
                      Canvas
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="gallery"
                      className="flex-1 justify-center gap-2"
                    >
                      <LayoutGrid className="size-4" />
                      Gallery
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsCreateDialogOpen(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button onClick={createPage}>Create</Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
                    "group/page-row flex h-8 items-center justify-between rounded-sm px-2 text-sm",
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
                    "group/page-row h-8 px-2",
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
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          className="size-6 opacity-0 transition-opacity group-hover/page-row:opacity-100"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                        >
                          <EllipsisVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        side="right"
                        className="w-36"
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            openRenamePage(page.id);
                          }}
                        >
                          <Pencil />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            setDeletePageId(page.id);
                          }}
                        >
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </div>
        )}
      </DropdownMenuContent>

      <Dialog
        open={Boolean(renamePageId)}
        onOpenChange={(open) => !open && setRenamePageId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename page</DialogTitle>
            <DialogDescription>Update the page name.</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commitRenamePage();
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRenamePageId(null);
                setRenameValue("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={commitRenamePage}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deletePageId)}
        onOpenChange={(open) => !open && setDeletePageId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete page</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePageId(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeletePage}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </DropdownMenu>
  );
}

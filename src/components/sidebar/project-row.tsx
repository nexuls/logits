"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CopyPlus,
  Download,
  EllipsisVertical,
  FileCode2,
  Link2,
  Pencil,
  Pin,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useMetadata } from "@/components/providers/metadata";

type ProjectItem = {
  id: string;
  name: string;
};

const rowMenuItems = [
  { label: "Copy link", icon: Link2 },
  { label: "Rename", icon: Pencil },
  { label: "Duplicate", icon: CopyPlus },
  { label: "Download", icon: Download },
  { label: "Pin file", icon: Pin },
] as const;

export function ProjectRow({
  project,
  active = false,
}: {
  project: ProjectItem;
  active?: boolean;
}) {
  const router = useRouter();
  const renameInputRef = useRef<HTMLInputElement>(null);
  const shouldKeepFocusOnCloseRef = useRef(false);
  const ignoreBlurUntilRef = useRef(0);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const { renameProject, duplicateProject, deleteProject, pinProject } =
    useMetadata();

  useEffect(() => {
    setRenameValue(project.name);
  }, [project.name]);

  useEffect(() => {
    if (!isRenaming) {
      return;
    }

    const focusInput = () => {
      const input = renameInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
      input.select();
    };

    const frameId = window.requestAnimationFrame(() => {
      focusInput();
    });
    const timeoutId = window.setTimeout(() => {
      focusInput();
    }, 50);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.clearTimeout(timeoutId);
    };
  }, [isRenaming]);

  const commitRename = async () => {
    const nextName = renameValue.trim();

    if (!nextName || nextName === project.name) {
      setRenameValue(project.name);
      setIsRenaming(false);
      return;
    }

    await renameProject(project.id, nextName);
    toast.success("Project renamed");
    setIsRenaming(false);
  };

  const onDeleteConfirm = async () => {
    const fallbackProject = await deleteProject(project.id);
    toast.success("Project deleted");
    setIsDeleteDialogOpen(false);

    if (active) {
      if (fallbackProject) {
        router.push(`/p/${fallbackProject.id}`);
      } else {
        router.push("/");
      }
    }
  };

  const onProjectAction = async (action: string) => {
    try {
      if (action === "Copy link") {
        if (typeof window === "undefined") {
          return;
        }

        const projectUrl = `${window.location.origin}/p/${project.id}`;
        await navigator.clipboard.writeText(projectUrl);
        toast.success("Project link copied");
        return;
      }

      if (action === "Rename") {
        shouldKeepFocusOnCloseRef.current = true;
        ignoreBlurUntilRef.current = Date.now() + 220;
        setRenameValue(project.name);
        setIsRenaming(true);
        return;
      }

      if (action === "Duplicate") {
        const duplicated = await duplicateProject(project.id);

        if (duplicated) {
          toast.success("Project duplicated");
          router.push(`/p/${duplicated.id}`);
        } else {
          toast.error("Could not duplicate project");
        }

        return;
      }

      if (action === "Pin file") {
        await pinProject(project.id);
        toast.success("Project pinned");
        return;
      }

      if (action === "Download") {
        toast.info("Download is not available yet");
        return;
      }

      if (action === "Delete") {
        setIsDeleteDialogOpen(true);
      }
    } catch {
      toast.error("Action failed. Please try again.");
    }
  };

  return (
    <SidebarMenuItem>
      {isRenaming ? (
        <SidebarMenuButton isActive={active} className="ring-1 rounded-md text-sm">
          <div className="flex w-full items-center gap-2">
            <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={renameInputRef}
              value={renameValue}
              onChange={(event) => setRenameValue(event.currentTarget.value)}
              onBlur={() => {
                if (Date.now() < ignoreBlurUntilRef.current) {
                  window.requestAnimationFrame(() => {
                    renameInputRef.current?.focus();
                    renameInputRef.current?.select();
                  });
                  return;
                }

                void commitRename();
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void commitRename();
                }

                if (event.key === "Escape") {
                  event.preventDefault();
                  setRenameValue(project.name);
                  setIsRenaming(false);
                  toast.info("Rename cancelled");
                }
              }}
              className="h-7 p-0 border-0 bg-transparent! focus:ring-0 focus-visible:ring-0"
              aria-label="Rename project"
            />
          </div>
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          asChild
          isActive={active}
          className="rounded-md text-sm"
        >
          <Link
            href={`/p/${project.id}`}
            className="flex w-full items-center gap-2"
          >
            <FileCode2 className="size-4 shrink-0 text-muted-foreground" />
            <span>{project.name}</span>
          </Link>
        </SidebarMenuButton>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            showOnHover
            className="top-0! right-0 h-full w-auto aspect-square cursor-pointer text-muted-foreground hover:text-foreground"
            aria-label={`${project.name} options`}
          >
            <EllipsisVertical />
          </SidebarMenuAction>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          side="right"
          className="w-44"
          onCloseAutoFocus={(event) => {
            if (shouldKeepFocusOnCloseRef.current) {
              event.preventDefault();
              shouldKeepFocusOnCloseRef.current = false;
            }
          }}
        >
          {rowMenuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onSelect={() => {
                void onProjectAction(item.label);
              }}
            >
              <item.icon />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              void onProjectAction("Delete");
            }}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project</DialogTitle>
            <DialogDescription>
              Delete "{project.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDeleteDialogOpen(false);
                toast.info("Delete cancelled");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                void onDeleteConfirm();
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  );
}

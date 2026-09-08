"use client";

import {
  CopyIcon,
  DownloadIcon,
  MoreHorizontalIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditableText from "@/components/ui/editable-text";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  title: string;
  onTitleChange?: (title: string) => void;
  onNewProject?: () => void;
  onRenameProject?: () => void;
  onDuplicateProject?: () => void;
  onExportProject?: () => void;
  onDeleteProject?: () => void;
  /** Opens the settings dialog. Absent leaves the menu item disabled. */
  onOpenSettings?: () => void;
};

/**
 * Floating canvas header, mirroring the minimap in the opposite corner.
 *
 * It owns the only sidebar toggle, so it stays mounted on every breakpoint —
 * on mobile the sidebar is an off-canvas sheet with no trigger of its own.
 */
export default function Header({
  title,
  onTitleChange,
  onNewProject,
  onRenameProject,
  onDuplicateProject,
  onExportProject,
  onDeleteProject,
  onOpenSettings,
}: Props) {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isSidebarOpen = isMobile ? openMobile : open;

  return (
    <div className="absolute left-0 top-0 z-20 flex max-w-[min(20rem,calc(100%-1rem))] items-center gap-4 rounded-br-lg bg-sidebar px-2 py-1.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={toggleSidebar}
        aria-label={isSidebarOpen ? "Hide projects" : "Show projects"}
        aria-expanded={isSidebarOpen}
      >
        <PanelLeftIcon />
      </Button>

      <h1 className="min-w-0 flex-1 text-sm font-medium">
        <EditableText
          value={title}
          onChange={(next) => onTitleChange?.(next)}
          label="Project name"
          placeholder="Untitled circuit"
          activateOnDoubleClick={onTitleChange !== undefined}
          className="px-2 py-1"
        />
      </h1>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              aria-label="Project menu"
            >
              <MoreHorizontalIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="start" className="min-w-52">
          <DropdownMenuItem onClick={onNewProject} disabled={!onNewProject}>
            <PlusIcon />
            New project
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onRenameProject}
            disabled={!onRenameProject}
          >
            <PencilIcon />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDuplicateProject}
            disabled={!onDuplicateProject}
          >
            <CopyIcon />
            Duplicate
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onClick={onExportProject}
            disabled={!onExportProject}
          >
            <DownloadIcon />
            Export as JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onOpenSettings} disabled={!onOpenSettings}>
            <SlidersHorizontalIcon />
            Settings
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onClick={onDeleteProject}
            disabled={!onDeleteProject}
          >
            <Trash2Icon />
            Delete project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

"use client";

import {
  CircuitBoardIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditableText from "@/components/ui/editable-text";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ProjectMeta } from "@/lib/circuit/schema";
import { formatNodeCount, formatUpdated } from "./projects";

type Props = {
  project: ProjectMeta;
  isActive: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
  onTogglePin: () => void;
  onRequestDelete: () => void;
};

export default function ProjectItem({
  project,
  isActive,
  isEditing,
  onSelect,
  onEditingChange,
  onRename,
  onTogglePin,
  onRequestDelete,
}: Props) {
  const body = (
    <>
      {project.pinned ? (
        <PinIcon className="text-sidebar-primary" />
      ) : (
        <CircuitBoardIcon />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <EditableText
          value={project.name}
          onChange={onRename}
          label="Project name"
          editing={isEditing}
          onEditingChange={onEditingChange}
          className="min-w-0 font-medium"
        />
        <span className="truncate px-1 text-xs font-normal text-muted-foreground">
          {formatNodeCount(project.nodeCount)} ·{" "}
          {formatUpdated(project.updatedAt)}
        </span>
      </span>
    </>
  );

  return (
    <SidebarMenuItem className="hhh">
      {isEditing ? (
        // A text editor may not live inside a button, so the row drops to a
        // plain element while renaming and carries the highlight itself.
        <SidebarMenuButton
          render={<div />}
          size="lg"
          isActive={isActive}
          className="bg-sidebar-accent text-sidebar-accent-foreground ring-3 group-has-data-[sidebar=menu-action]/menu-item:pr-10"
        >
          {body}
        </SidebarMenuButton>
      ) : (
        <SidebarMenuButton
          size="lg"
          isActive={isActive}
          onClick={onSelect}
          onDoubleClick={() => onEditingChange(true)}
          onKeyDown={(event) => {
            if (event.metaKey || event.ctrlKey || event.altKey) return;

            if (event.key === "F2") {
              event.preventDefault();
              onEditingChange(true);
            } else if (event.key === "Delete") {
              event.preventDefault();
              onRequestDelete();
            }
          }}
          className="group-has-data-[sidebar=menu-action]/menu-item:pr-10"
          aria-current={isActive ? "true" : undefined}
          aria-keyshortcuts="F2 Delete"
        >
          {body}
        </SidebarMenuButton>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={<SidebarMenuAction showOnHover />}
          aria-label={`Actions for ${project.name}`}
          className={"right-3"}
        >
          <MoreHorizontalIcon />
        </DropdownMenuTrigger>
        {/* Width is anchored to the trigger by default, and the trigger is a
            20px square — so this menu has to size itself. */}
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => onEditingChange(true)}>
            <PencilIcon />
            Rename
            <DropdownMenuShortcut>F2</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onTogglePin}>
            {project.pinned ? <PinOffIcon /> : <PinIcon />}
            {project.pinned ? "Unpin" : "Pin"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={onRequestDelete}>
            <Trash2Icon />
            Delete
            <DropdownMenuShortcut>Del</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

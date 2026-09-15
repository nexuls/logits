"use client";

import { CircuitBoardIcon, MoreHorizontalIcon, PinIcon } from "lucide-react";
import { useRef } from "react";

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import EditableText from "@/components/ui/editable-text";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { ProjectMeta } from "@/lib/circuit/schema";
import ProjectMenuItems from "./project-menu-items";
import { formatNodeCount, formatUpdated } from "./projects";

type Props = {
  project: ProjectMeta;
  isActive: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onCopyLink: () => void;
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
  onDuplicate,
  onExport,
  onCopyLink,
  onRequestDelete,
}: Props) {
  // Rename puts focus in the name editor. A menu hands focus back to its
  // trigger as it closes, which would blur that editor — and a blur commits
  // the rename before a key is typed — so Rename opts out of the return.
  const keepFocus = useRef(false);
  const finalFocus = () => {
    const restore = !keepFocus.current;
    keepFocus.current = false;
    return restore;
  };

  const menuItems = (menu: "dropdown" | "context") => (
    <ProjectMenuItems
      menu={menu}
      pinned={Boolean(project.pinned)}
      onRename={() => {
        keepFocus.current = true;
        onEditingChange(true);
      }}
      onTogglePin={onTogglePin}
      onDuplicate={onDuplicate}
      onExport={onExport}
      onCopyLink={onCopyLink}
      onRequestDelete={onRequestDelete}
    />
  );

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
    // Right-click anywhere on the row opens the same actions as its ⋯ button.
    // Off while renaming, so a right-click in the name field still gets the
    // browser's own menu — paste included.
    <ContextMenu disabled={isEditing}>
      <ContextMenuTrigger render={<SidebarMenuItem />}>
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
          <DropdownMenuContent
            align="end"
            className="w-48"
            finalFocus={finalFocus}
          >
            {menuItems("dropdown")}
          </DropdownMenuContent>
        </DropdownMenu>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-48" finalFocus={finalFocus}>
        {menuItems("context")}
      </ContextMenuContent>
    </ContextMenu>
  );
}

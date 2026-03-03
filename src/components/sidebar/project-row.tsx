"use client";

import Link from "next/link";
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

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
  const onProjectAction = (action: string) => {
    console.info("[placeholder] project action", {
      action,
      projectId: project.id,
    });
  };

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        className="rounded-md text-sm"
      >
        <Link href={`/p/${project.id}`}>
          <FileCode2 className="size-4 text-muted-foreground" />
          <span>{project.name}</span>
        </Link>
      </SidebarMenuButton>

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

        <DropdownMenuContent align="end" side="right" className="w-44">
          {rowMenuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              onClick={() => onProjectAction(item.label)}
            >
              <item.icon />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onProjectAction("Delete")}
          >
            <Trash2 />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

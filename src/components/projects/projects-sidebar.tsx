"use client";

import { CircuitBoardIcon, PinIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import EditableText from "@/components/ui/editable-text";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { type Project, SAMPLE_PROJECTS } from "./projects";

type Props = {
  projects?: Project[];
  activeProjectId?: string;
  onSelectProject?: (projectId: string) => void;
  onCreateProject?: () => void;
  onRenameProject?: (projectId: string, name: string) => void;
};

export default function ProjectsSidebar({
  projects = SAMPLE_PROJECTS,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
}: Props) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  // Sample projects are read-only, so renames live here until a store exists.
  const [renames, setRenames] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState(
    activeProjectId ?? projects[0]?.id,
  );

  const activeId = activeProjectId ?? selectedId;

  const matches = useMemo(() => {
    const named = projects.map((project) => ({
      ...project,
      name: renames[project.id] ?? project.name,
    }));
    const needle = query.trim().toLowerCase();

    if (needle.length === 0) {
      return named;
    }

    return named.filter((project) =>
      project.name.toLowerCase().includes(needle),
    );
  }, [projects, query, renames]);

  const pinned = matches.filter((project) => project.pinned);
  const rest = matches.filter((project) => !project.pinned);

  const selectProject = (projectId: string) => {
    setSelectedId(projectId);
    onSelectProject?.(projectId);
  };

  const renameProject = (projectId: string, name: string) => {
    setRenames((prev) => ({ ...prev, [projectId]: name }));
    onRenameProject?.(projectId, name);
  };

  const renderGroup = (label: string, items: Project[], showPin = false) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((project) => {
              const isEditing = project.id === editingId;
              const icon = showPin ? (
                <PinIcon className="text-sidebar-primary" />
              ) : (
                <CircuitBoardIcon />
              );

              return (
                <SidebarMenuItem key={project.id}>
                  {isEditing ? (
                    // Swapped for a non-button row while renaming: an editor may
                    // not live inside a button. The row carries the highlight so
                    // the whole item reads as the thing being edited.
                    <SidebarMenuButton
                      render={<div />}
                      isActive={project.id === activeId}
                      className="bg-sidebar-accent pr-10 text-sidebar-accent-foreground ring-3"
                    >
                      {icon}
                      <EditableText
                        value={project.name}
                        onChange={(name) => renameProject(project.id, name)}
                        label="Project name"
                        editing
                        onEditingChange={(editing) => {
                          if (!editing) {
                            setEditingId(null);
                          }
                        }}
                        className="min-w-0 flex-1 bg-transparent font-medium ring-0"
                      />
                    </SidebarMenuButton>
                  ) : (
                    <SidebarMenuButton
                      isActive={project.id === activeId}
                      onClick={() => selectProject(project.id)}
                      onDoubleClick={() => setEditingId(project.id)}
                      onKeyDown={(event) => {
                        if (event.key === "F2") {
                          event.preventDefault();
                          setEditingId(project.id);
                        }
                      }}
                      aria-current={
                        project.id === activeId ? "true" : undefined
                      }
                      aria-keyshortcuts="F2"
                      className="pr-10"
                    >
                      {icon}
                      <EditableText
                        value={project.name}
                        onChange={(name) => renameProject(project.id, name)}
                        label="Project name"
                        className="min-w-0 flex-1 font-medium"
                      />
                    </SidebarMenuButton>
                  )}
                  <SidebarMenuBadge>{project.nodeCount}</SidebarMenuBadge>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar side="left" collapsible="offcanvas">
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-semibold">Projects</span>
        </div>

        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <SidebarInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {renderGroup("Pinned", pinned, true)}
        {renderGroup("All projects", rest)}

        {matches.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No projects match “{query.trim()}”.
          </p>
        )}
      </SidebarContent>

      <SidebarFooter>
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={onCreateProject}
        >
          <PlusIcon />
          New project
        </Button>
        <p className="px-1 text-xs text-center text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
          <Kbd>⌘B</Kbd> to toggle
        </p>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

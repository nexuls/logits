"use client";

import { CircuitBoardIcon, PinIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
};

export default function ProjectsSidebar({
  projects = SAMPLE_PROJECTS,
  activeProjectId,
  onSelectProject,
  onCreateProject,
}: Props) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(
    activeProjectId ?? projects[0]?.id,
  );

  const activeId = activeProjectId ?? selectedId;

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (needle.length === 0) {
      return projects;
    }

    return projects.filter((project) =>
      project.name.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const pinned = matches.filter((project) => project.pinned);
  const rest = matches.filter((project) => !project.pinned);

  const selectProject = (projectId: string) => {
    setSelectedId(projectId);
    onSelectProject?.(projectId);
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
            {items.map((project) => (
              <SidebarMenuItem key={project.id}>
                <SidebarMenuButton
                  size="lg"
                  isActive={project.id === activeId}
                  onClick={() => selectProject(project.id)}
                  aria-current={project.id === activeId ? "true" : undefined}
                  className="pr-10"
                >
                  {showPin ? (
                    <PinIcon className="text-sidebar-primary" />
                  ) : (
                    <CircuitBoardIcon />
                  )}
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{project.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      Edited {project.updatedLabel}
                    </span>
                  </span>
                </SidebarMenuButton>
                <SidebarMenuBadge className="">
                  {project.nodeCount}
                </SidebarMenuBadge>
              </SidebarMenuItem>
            ))}
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

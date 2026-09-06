"use client";

import {
  CircuitBoardIcon,
  PanelLeftIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
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
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
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
  const { toggleSidebar } = useSidebar();
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
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-sm font-semibold">Projects</span>
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={toggleSidebar}
            aria-label="Collapse projects sidebar"
          >
            <PanelLeftIcon />
          </Button>
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

/**
 * Floating way back into an off-canvas sidebar. It fades rather than unmounts,
 * so it is taken out of the tab order while it is invisible.
 */
export function ProjectsSidebarTrigger() {
  const { open, isMobile, openMobile, toggleSidebar } = useSidebar();
  const hide = isMobile ? openMobile : open;

  return (
    <Button
      variant="outline"
      size="icon-lg"
      onClick={toggleSidebar}
      aria-label="Show projects"
      tabIndex={hide ? -1 : undefined}
      className={cn(
        "absolute top-3 left-3 z-20 bg-background transition-opacity",
        {
          "opacity-0 pointer-events-none": hide,
        },
      )}
    >
      <PanelLeftIcon />
    </Button>
  );
}

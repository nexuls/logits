"use client";

import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { AppSidebarFooter } from "./sidebar-footer";
import { AppSidebarHeader } from "./sidebar-header";
import { ProjectGroup } from "./project-group";
import { useMetadata } from "@/components/providers/metadata";

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function AppSidebar() {
  const { projects } = useMetadata();

  const sortedProjects = [...projects].sort((first, second) => {
    return (
      new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime()
    );
  });

  const now = Date.now();
  const thisWeekProjects = sortedProjects.filter((project) => {
    return now - new Date(project.updatedAt).getTime() <= ONE_WEEK_MS;
  });
  const olderProjects = sortedProjects.filter((project) => {
    return now - new Date(project.updatedAt).getTime() > ONE_WEEK_MS;
  });
  const activeProjectId = thisWeekProjects[0]?.id ?? olderProjects[0]?.id;

  return (
    <Sidebar className="border-r border-sidebar-border">
      <AppSidebarHeader />

      <SidebarContent className="px-2 py-1">
        <ProjectGroup
          title="This week"
          projects={thisWeekProjects}
          activeProjectId={activeProjectId}
          className="p-0"
        />
        <ProjectGroup
          title="Older"
          projects={olderProjects}
          activeProjectId={activeProjectId}
          className="p-0 pt-2"
        />
      </SidebarContent>

      <AppSidebarFooter />
    </Sidebar>
  );
}

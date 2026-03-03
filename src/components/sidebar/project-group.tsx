"use client";

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
} from "@/components/ui/sidebar";
import { ProjectRow } from "./project-row";

type ProjectItem = {
  id: string;
  name: string;
};

export function ProjectGroup({
  title,
  projects,
  activeProjectId,
  className,
}: {
  title: string;
  projects: ProjectItem[];
  activeProjectId?: string;
  className?: string;
}) {
  if (!projects.length) {
    return null;
  }

  return (
    <SidebarGroup className={className}>
      <SidebarGroupLabel className="gap-2 px-3 text-xs font-medium text-muted-foreground/90">
        <span>{title}</span>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              active={project.id === activeProjectId}
            />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

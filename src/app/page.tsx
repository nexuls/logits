"use client";

import { useEffect, useState } from "react";

import Canvas from "@/components/canvas";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { renameProject, useProjects } from "@/state/projects-store";

export default function Home() {
  const projects = useProjects();
  const [activeId, setActiveId] = useState("");

  // The list is empty until hydration reads storage, so the opening project can
  // only be picked once it arrives — and picked again if the open one is
  // deleted from under us.
  useEffect(() => {
    setActiveId((current) =>
      projects.some((project) => project.id === current)
        ? current
        : (projects[0]?.id ?? ""),
    );
  }, [projects]);

  const active = projects.find((project) => project.id === activeId);

  return (
    <SidebarProvider className="h-svh min-h-0">
      <ProjectsSidebar
        activeProjectId={activeId}
        onSelectProject={setActiveId}
      />
      <SidebarInset className="relative min-w-0 overflow-hidden">
        <Canvas
          content=""
          title={active?.name ?? "No circuit open"}
          // Renaming from the canvas header is the same rename as the
          // sidebar's; both write the document, which owns the name.
          onTitleChange={
            active
              ? (name) => {
                  renameProject(active.id, name);
                }
              : undefined
          }
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

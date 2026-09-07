"use client";

import { useEffect, useState } from "react";

import Canvas from "@/components/canvas";
import ElementsSidebar from "@/components/editor/elements-sidebar";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppliedTheme, useEditorSettings } from "@/state/editor-settings";
import { renameProject, useProjects } from "@/state/projects-store";

export default function Home() {
  const projects = useProjects();
  const settings = useEditorSettings();
  const [activeId, setActiveId] = useState("");
  // The node armed for placement. Nothing consumes it yet — the canvas gains
  // placement in Phase 3 — but the palette owns the choice, not the canvas.
  const [pendingType, setPendingType] = useState<string | null>(null);

  // Applied here rather than inside the settings panel: the panel unmounts
  // with the mobile sidebar sheet, and the theme must outlive that.
  const theme = useAppliedTheme();

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
      <SidebarInset className="min-w-0 flex-row overflow-hidden">
        <div className="relative min-w-0 flex-1">
          <Canvas
            content=""
            title={active?.name ?? "No circuit open"}
            showGrid={settings.showGrid}
            showMinimap={settings.showMinimap}
            themeKey={theme}
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
        </div>

        <ElementsSidebar
          selectedType={pendingType}
          onSelectType={(type) =>
            // Clicking the armed element again disarms it, so there is a way
            // out of placement mode without a second control.
            setPendingType((current) => (current === type ? null : type))
          }
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

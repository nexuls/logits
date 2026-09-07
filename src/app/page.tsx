"use client";

import { useEffect, useState } from "react";

import Editor from "@/components/editor/editor";
import ElementsSidebar from "@/components/editor/elements-sidebar";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { useAppliedTheme, useEditorSettings } from "@/state/editor-settings";
import { useProjects } from "@/state/projects-store";

export default function Home() {
  const projects = useProjects();
  const settings = useEditorSettings();
  const [activeId, setActiveId] = useState("");
  // The node type armed for placement. The palette owns the choice and the
  // canvas consumes it, so neither has to know about the other.
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

  return (
    <SidebarProvider className="h-svh min-h-0">
      <ProjectsSidebar
        activeProjectId={activeId}
        onSelectProject={setActiveId}
      />
      <SidebarInset className="min-w-0 flex-row overflow-hidden">
        <div className="relative min-w-0 flex-1">
          <Editor
            projectId={activeId}
            showGrid={settings.showGrid}
            showMinimap={settings.showMinimap}
            themeKey={theme}
            armedType={pendingType}
            onDisarm={() => setPendingType(null)}
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

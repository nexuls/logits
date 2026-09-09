"use client";

import { useEffect, useState } from "react";
import Editor from "@/components/editor/editor";
import ElementsSidebar from "@/components/editor/elements-sidebar";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getExample } from "@/example";
import { MAX_PLACEMENT_COUNT } from "@/lib/circuit/geometry";
import { useAppliedTheme, useEditorSettings } from "@/state/editor-settings";
import { useProjects } from "@/state/projects-store";

export default function Home() {
  const projects = useProjects();
  const settings = useEditorSettings();
  const [activeId, setActiveId] = useState("");
  // The node type armed for placement, and how many copies the next canvas
  // click drops. The palette owns the choice and the canvas consumes it, so
  // neither has to know about the other; a count of zero *is* disarmed, which
  // is what right-clicking down past one leaves behind.
  const [pending, setPending] = useState<{ type: string; count: number }>({
    type: "",
    count: 0,
  });
  const pendingType = pending.count > 0 ? pending.type : null;

  // Applied here rather than inside the settings panel: the panel unmounts
  // with the mobile sidebar sheet, and the theme must outlive that.
  const theme = useAppliedTheme();

  // The list is empty until hydration reads storage, so the opening project can
  // only be picked once it arrives — and picked again if the open one is
  // deleted from under us. An example is a valid selection that is deliberately
  // not in the list, so it has to survive this too.
  useEffect(() => {
    setActiveId((current) =>
      getExample(current) || projects.some((project) => project.id === current)
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
            showBasicPinLabels={settings.showBasicPinLabels}
            showCompoundPinLabels={settings.showCompoundPinLabels}
            themeKey={theme}
            armedType={pendingType}
            armedCount={pending.count}
            onDisarm={() => setPending({ type: "", count: 0 })}
          />
        </div>

        <ElementsSidebar
          selectedType={pendingType}
          selectedCount={pending.count}
          onAdjustCount={(type, delta) =>
            setPending((current) => {
              // A different element always starts a fresh batch of one — a
              // right-click on something that is not armed arms nothing.
              if (current.type !== type || current.count === 0) {
                return { type, count: delta > 0 ? 1 : 0 };
              }
              return {
                type,
                count: Math.min(
                  MAX_PLACEMENT_COUNT,
                  Math.max(0, current.count + delta),
                ),
              };
            })
          }
        />
      </SidebarInset>
    </SidebarProvider>
  );
}

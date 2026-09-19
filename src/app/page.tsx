"use client";

import { useEffect, useState } from "react";
import Editor from "@/components/editor/editor";
import ElementsSidebar from "@/components/editor/elements-sidebar";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { useProjectRoute } from "@/components/projects/use-project-route";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getExample } from "@/example";
import { MAX_PLACEMENT_COUNT } from "@/lib/circuit/geometry";
import { useAppliedTheme, useEditorSettings } from "@/state/editor-settings";
import { useProjects, useProjectsHydrated } from "@/state/projects-store";

export default function Home() {
  const projects = useProjects();
  const projectsHydrated = useProjectsHydrated();
  const settings = useEditorSettings();
  const { activeId, ready, select, settle } = useProjectRoute();
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

  // Picks the opening project, and picks again if the open one is deleted from
  // under us. An example is a valid selection that is deliberately not in the
  // list, so it has to survive this too. A `?p=` naming a project this browser
  // does not have falls through to the first one, which is what a link from
  // another machine is.
  //
  // Both guards are load-bearing, and each one on its own is a bug. Until
  // `ready`, `activeId` is still "" whatever the URL says, so this would settle
  // over the id in the link. Until `projectsHydrated`, an empty list means
  // "storage not read yet" rather than "no projects", so this would settle to
  // nothing at all and clear the URL on the way.
  useEffect(() => {
    if (!ready || !projectsHydrated) return;
    if (
      getExample(activeId) ||
      projects.some((project) => project.id === activeId)
    ) {
      return;
    }
    settle(projects[0]?.id ?? "");
  }, [ready, projectsHydrated, projects, activeId, settle]);

  return (
    <SidebarProvider className="h-svh min-h-0">
      <ProjectsSidebar activeProjectId={activeId} onSelectProject={select} />
      <SidebarInset className="min-w-0 flex-row overflow-hidden">
        <div className="relative min-w-0 flex-1">
          <Editor
            projectId={activeId}
            showGrid={settings.showGrid}
            showMinimap={settings.showMinimap}
            showBasicPinLabels={settings.showBasicPinLabels}
            showCompoundPinLabels={settings.showCompoundPinLabels}
            showBusValues={settings.showBusValues}
            themeKey={theme}
            armedType={pendingType}
            armedCount={pending.count}
            onDisarm={() => setPending({ type: "", count: 0 })}
            onSelectProject={select}
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

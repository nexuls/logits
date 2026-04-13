"use client";

import { useCallback } from "react";
import { usePathname } from "next/navigation";
import { useNotebooks } from "@/hooks/use-notebooks";
import { useFileSelection } from "@/data/file-selection";
import { useUserSettings } from "@/hooks/use-user-settings";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { FileTree } from "./file-tree";
import { AppSidebarFooter } from "./sidebar-footer";
import { AppSidebarHeader } from "./sidebar-header";

const DEFAULT_SIDEBAR_WIDTH = 288;
const MIN_SIDEBAR_WIDTH = 220;
const MAX_SIDEBAR_WIDTH = 560;

export function AppSidebar() {
  const pathname = usePathname();
  const { selectedFileId: activeFileId } = useFileSelection();
  const { settings, updateSettings } = useUserSettings();
  const { notebooks, getNotebookFiles } = useNotebooks();
  const routeNotebookId = pathname.startsWith("/p/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : "";
  const activeNotebookId = routeNotebookId || notebooks[0]?.id || "";
  const activeNotebook = notebooks.find(
    (notebook) => notebook.id === activeNotebookId,
  );
  const sidebarWidth =
    settings.appearance?.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH;
  const sidebarPosition = settings.appearance?.sidebarPosition ?? "left";
  const notebookFiles = activeNotebook
    ? getNotebookFiles(activeNotebook.id)
    : [];

  const handleSidebarWidthCommit = useCallback(
    (nextWidth: number) => {
      const clampedWidth = Math.max(
        MIN_SIDEBAR_WIDTH,
        Math.min(MAX_SIDEBAR_WIDTH, Math.round(nextWidth)),
      );

      if (clampedWidth === settings.appearance?.sidebarWidth) {
        return;
      }

      void updateSettings((currentSettings) => ({
        appearance: {
          ...currentSettings.appearance,
          sidebarWidth: clampedWidth,
        },
      }));
    },
    [settings.appearance?.sidebarWidth, updateSettings],
  );

  return (
    <Sidebar
      className={
        sidebarPosition === "left"
          ? "border-r border-sidebar-border"
          : "border-l border-sidebar-border"
      }
      side={sidebarPosition}
      resizable
      width={sidebarWidth}
      minWidth={MIN_SIDEBAR_WIDTH}
      maxWidth={MAX_SIDEBAR_WIDTH}
      onWidthCommit={handleSidebarWidthCommit}
    >
      <AppSidebarHeader activeNotebookId={activeNotebookId} />

      <SidebarContent className="px-2 pt-1 pb-3">
        {activeNotebook ? (
          <FileTree
            notebookId={activeNotebook.id}
            files={notebookFiles}
            activeFileId={activeFileId}
          />
        ) : null}
      </SidebarContent>

      <AppSidebarFooter />
    </Sidebar>
  );
}

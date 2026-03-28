"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useNotebooks } from "@/hooks/use-notebooks";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";
import { FileTree } from "./file-tree";
import { AppSidebarFooter } from "./sidebar-footer";
import { AppSidebarHeader } from "./sidebar-header";

export function AppSidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { notebooks, getNotebookFiles } = useNotebooks();
  const routeNotebookId = pathname.startsWith("/p/")
    ? decodeURIComponent(pathname.split("/")[2] ?? "")
    : "";
  const activeNotebookId = routeNotebookId || notebooks[0]?.id || "";
  const activeFileId = searchParams.get("file") ?? "";
  const activeNotebook = notebooks.find(
    (notebook) => notebook.id === activeNotebookId,
  );
  const notebookFiles = activeNotebook
    ? getNotebookFiles(activeNotebook.id)
    : [];

  return (
    <Sidebar className="border-r border-sidebar-border">
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

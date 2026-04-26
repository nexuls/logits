"use client";

import { useEffect } from "react";
import { Ellipsis, Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFileSelection } from "@/data/file-selection";
import { useWorkspaceCommands } from "@/components/workspace/commands";

/**
 * Active-file keyboard shortcuts owned by the editor menu. Listed here
 * (and re-exported through the keyboard-shortcuts dialog) so the dialog
 * and the listener share a single source.
 */
export const EDITOR_MENU_KEYBOARD_SHORTCUTS = {
  openPreviewInTab: "Mod-Shift-v",
  openPreviewInSplit: "Mod-Alt-v",
  openPdfEditor: "Mod-Shift-d",
} as const;

export function NotebookActions() {
  return (
    <div className="ml-3 flex shrink-0 items-center gap-1.5">
      <EditorMenu />
    </div>
  );
}

function EditorMenu() {
  const { selectedFileId, selectFile } = useFileSelection();
  const workspaceCommands = useWorkspaceCommands();
  const activeFileId = selectedFileId || undefined;

  const openPreviewInTabView = () => {
    if (!activeFileId) return;
    selectFile(activeFileId, "preview");
  };

  const openPreviewInSplitView = () => {
    if (!activeFileId) return;
    workspaceCommands?.openInSplit(activeFileId, "preview");
  };

  const openPdfEditor = () => {
    if (!activeFileId) return;
    selectFile(activeFileId, "pdf");
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;
      if (!isMod || !activeFileId) return;

      const key = event.key.toLowerCase();

      if (event.shiftKey && !event.altKey && key === "v") {
        event.preventDefault();
        selectFile(activeFileId, "preview");
        return;
      }
      if (event.altKey && !event.shiftKey && key === "v") {
        event.preventDefault();
        workspaceCommands?.openInSplit(activeFileId, "preview");
        return;
      }
      if (event.shiftKey && !event.altKey && key === "d") {
        event.preventDefault();
        selectFile(activeFileId, "pdf");
        return;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeFileId, selectFile, workspaceCommands]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="More actions">
          <Ellipsis className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Eye className="size-4" />
            Preview
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={!activeFileId}
              onSelect={openPreviewInTabView}
            >
              Open in tab view
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!activeFileId || !workspaceCommands}
              onSelect={openPreviewInSplitView}
            >
              Open in split view
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={!activeFileId} onSelect={openPdfEditor}>
          <FileText className="size-4" />
          Open PDF editor
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

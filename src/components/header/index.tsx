/* biome-ignore-all lint/a11y: contentEditable is intentionally used for project-name editing */
"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { T_Page_Meta } from "@/types/types";
import PageDropdown from "./page-dropdown";
import HeaderMenu from "./header-menu";
import ProjectNameEditor from "./project-name-editor";
import { Button } from "../ui/button";
import { PanelLeftIcon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";

type Props = {
  className?: string;
  onProjectNameChange?: (newName: string) => void;
  onCurrentPageIdChange?: (pageId: string) => void;
  onPagesChange?: (pages: T_Page_Meta[]) => void;
} & (
  | {
      placeholder: false;
      projectName: string;
      pages: T_Page_Meta[];
      currentPageId: string;
    }
  | {
      placeholder: true;
      projectName?: never;
      pages?: never;
      currentPageId?: never;
    }
);

export default function Header({
  className,
  placeholder,
  projectName,
  pages,
  currentPageId,
  onProjectNameChange,
  onCurrentPageIdChange,
  onPagesChange,
}: Props) {
  const { toggleSidebar } = useSidebar();
  const [projectRenameSignal, setProjectRenameSignal] = useState<number | null>(
    null,
  );
  const [pageRenameSignal, setPageRenameSignal] = useState<number | null>(null);

  return (
    <div
      className={cn(
        "absolute z-50 top-0 left-0 right-0",
        "w-fit flex items-center justify-between p-2",
        "bg-background backdrop-blur-sm rounded-br-xl",
        className,
      )}
    >
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        {placeholder ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center rounded"></div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <ProjectNameEditor
                projectName={projectName}
                onProjectNameChange={onProjectNameChange}
                focusSignal={projectRenameSignal}
              />
              <span>/</span>
              <PageDropdown
                pages={pages}
                currentPageId={currentPageId}
                onCurrentPageIdChange={onCurrentPageIdChange}
                onPagesChange={onPagesChange}
                renameCurrentPageSignal={pageRenameSignal}
              />
            </div>

            <HeaderMenu
              onRenameProjectRequest={() => {
                setProjectRenameSignal((value) => (value ?? 0) + 1);
              }}
              onRenameCurrentPageRequest={() => {
                setPageRenameSignal((value) => (value ?? 0) + 1);
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}

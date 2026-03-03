/* biome-ignore-all lint/a11y: contentEditable is intentionally used for project-name editing */
"use client";

import { cn } from "@/lib/utils";
import type { PageMeta } from "@/types/types";
import PageDropdown from "./page-dropdown";
import HeaderMenu from "./header-menu";
import ProjectNameEditor from "./project-name-editor";
import { Button } from "../ui/button";
import { PanelLeftIcon } from "lucide-react";
import { useSidebar } from "../ui/sidebar";

type Props = {
  className?: string;
  projectName: string;
  onProjectNameChange?: (newName: string) => void;
  onCurrentPageIdChange?: (pageId: string) => void;
  onPagesChange?: (pages: PageMeta[]) => void;
  pages: PageMeta[];
  currentPageId: string;
};

export default function Header({
  className,
  projectName,
  onProjectNameChange,
  onCurrentPageIdChange,
  onPagesChange,
  pages,
  currentPageId,
}: Props) {
  const { toggleSidebar } = useSidebar();

  return (
    <div
      className={cn(
        "w-fit flex items-center justify-between p-2",
        "bg-muted/50 backdrop-blur-sm rounded-br-lg",
        className,
      )}
    >
      <div className="flex items-center">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        <div className="flex items-center gap-1">
          <ProjectNameEditor
            projectName={projectName}
            onProjectNameChange={onProjectNameChange}
          />
          <span>/</span>
          <PageDropdown
            pages={pages}
            currentPageId={currentPageId}
            onCurrentPageIdChange={onCurrentPageIdChange}
            onPagesChange={onPagesChange}
          />
        </div>

        <HeaderMenu />
      </div>
    </div>
  );
}

"use client";

import { PanelLeftIcon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import EditableText from "@/components/ui/editable-text";
import { useSidebar } from "@/components/ui/sidebar";

type Props = {
  title: string;
  onTitleChange?: (title: string) => void;
  /** Controls the title's edit mode from outside — how a "Rename" item opens it. */
  titleEditing?: boolean;
  onTitleEditingChange?: (editing: boolean) => void;
  /**
   * The menu beside the title. Supplied by the editor, which owns projects;
   * the canvas only gives it a place to sit.
   */
  menu?: ReactNode;
  /**
   * The projects sidebar button. Off where there is no `SidebarProvider` to
   * toggle — a preview embedded outside the app shell.
   */
  showSidebarToggle?: boolean;
};

/**
 * Floating canvas header, mirroring the minimap in the opposite corner.
 *
 * In the editor it owns the only sidebar toggle, so it stays mounted on every
 * breakpoint — on mobile the sidebar is an off-canvas sheet with no trigger of
 * its own.
 */
export default function Header({
  title,
  onTitleChange,
  titleEditing,
  onTitleEditingChange,
  menu,
  showSidebarToggle = true,
}: Props) {
  return (
    // Two caps, because the top row holds different things at each size. On a
    // narrow canvas the toolbar has dropped to its own row and the header
    // shares this one with the share and elements buttons, so it reserves the
    // 8rem they occupy. Once the toolbar is back up here it is centred and
    // 26rem wide, so the header has to stop well short of the middle.
    <div className="absolute left-0 top-0 z-20 flex max-w-[min(20rem,calc(100%-8rem))] items-center gap-4 rounded-br-lg bg-sidebar px-2 py-1.5 border-b border-r border-border shadow-chrome @min-[64rem]/canvas:max-w-64">
      {showSidebarToggle && <SidebarToggle />}

      <h1 className="min-w-0 flex-1 text-sm font-medium">
        <EditableText
          value={title}
          onChange={(next) => onTitleChange?.(next)}
          label="Project name"
          placeholder="Untitled circuit"
          editing={onTitleChange ? titleEditing : false}
          onEditingChange={onTitleEditingChange}
          activateOnDoubleClick={onTitleChange !== undefined}
          className="px-2 py-1"
        />
      </h1>

      {menu}
    </div>
  );
}

/** Its own component so `useSidebar`, which throws without a provider, is only called with one. */
function SidebarToggle() {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isSidebarOpen = isMobile ? openMobile : open;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-lg"
      onClick={toggleSidebar}
      aria-label={isSidebarOpen ? "Hide projects" : "Show projects"}
      aria-expanded={isSidebarOpen}
    >
      <PanelLeftIcon />
    </Button>
  );
}

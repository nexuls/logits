"use client";

import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { NodeDefinition } from "@/lib/nodes/define";

type Props = {
  definition: NodeDefinition;
  isSelected: boolean;
  onSelect: () => void;
};

/**
 * One palette entry. Everything it draws comes off the definition — glyph,
 * title, type — so a new node appears here without this file changing.
 * The glyph is decorative; the title is the accessible name, and it stays in
 * the DOM when the sidebar collapses so the icon rail is still labelled.
 */
export default function NodePaletteItem({
  definition,
  isSelected,
  onSelect,
}: Props) {
  const glyph = definition.symbol ?? definition.title.slice(0, 2);

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={isSelected}
        onClick={onSelect}
        tooltip={definition.title}
        // Palette entries choose the next node to place rather than navigate,
        // so they carry pressed state, not selected state.
        aria-pressed={isSelected}
      >
        <span
          aria-hidden
          className="flex size-5 shrink-0 items-center justify-center rounded-sm border border-sidebar-border font-mono text-[0.625rem] leading-none tracking-tight"
        >
          {glyph}
        </span>
        <span>{definition.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

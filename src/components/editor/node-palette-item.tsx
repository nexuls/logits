"use client";

import { nodeIcon } from "@/components/nodes/node-icons";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import type { NodeDefinition } from "@/lib/nodes/define";

type Props = {
  definition: NodeDefinition;
  isSelected: boolean;
  onSelect: () => void;
};

/**
 * One palette entry. Everything it draws comes off the definition — icon name,
 * title, type — so a new node appears here without this file changing.
 *
 * The icon is the identifier: at 24px a gate is recognisable by its outline
 * alone, which is the whole point of the collapsed rail. It stays decorative
 * though — the title is the accessible name and stays in the DOM when the
 * sidebar collapses, so the rail is still labelled and tooltipped.
 */
export default function NodePaletteItem({
  definition,
  isSelected,
  onSelect,
}: Props) {
  const Icon = nodeIcon(definition.icon);

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
        className="h-11 gap-3 [&_svg]:size-6 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-1.5!"
      >
        <Icon />
        <span>{definition.title}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

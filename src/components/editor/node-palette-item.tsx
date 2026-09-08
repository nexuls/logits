"use client";

import { nodeIcon } from "@/components/nodes/node-icons";
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar";
import { MAX_PLACEMENT_COUNT } from "@/lib/circuit/geometry";
import type { NodeDefinition } from "@/lib/nodes/define";

type Props = {
  definition: NodeDefinition;
  /** Copies of this element armed for the next canvas click; 0 when not armed. */
  count: number;
  /** +1 to arm one more, -1 to arm one fewer. Zero disarms. */
  onAdjust: (delta: number) => void;
};

/**
 * One palette entry. Everything it draws comes off the definition — icon name,
 * title, type — so a new node appears here without this file changing.
 *
 * The icon is the identifier: at 24px a gate is recognisable by its outline
 * alone, which is the whole point of the collapsed rail. It stays decorative
 * though — the title is the accessible name and stays in the DOM when the
 * sidebar collapses, so the rail is still labelled and tooltipped.
 *
 * Clicking again arms a second copy, up to `MAX_PLACEMENT_COUNT`, and a
 * right-click takes one back off — the batch a single canvas click will drop.
 * Right-click is a pointer-only gesture, so `-` and the arrow keys do the same
 * thing from the keyboard, and the count is in the accessible name rather than
 * only in the badge.
 */
export default function NodePaletteItem({
  definition,
  count,
  onAdjust,
}: Props) {
  const Icon = nodeIcon(definition.icon);
  const armed = count > 0;
  const atLimit = count >= MAX_PLACEMENT_COUNT;

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        type="button"
        isActive={armed}
        onClick={() => onAdjust(1)}
        onContextMenu={(event) => {
          // The browser menu has nothing to offer over a palette entry, and
          // taking it over is what makes "one fewer" a single gesture.
          event.preventDefault();
          onAdjust(-1);
        }}
        onKeyDown={(event) => {
          if (event.key === "-" || event.key === "ArrowDown") {
            event.preventDefault();
            onAdjust(-1);
          } else if (event.key === "+" || event.key === "=") {
            event.preventDefault();
            onAdjust(1);
          }
        }}
        tooltip={
          armed
            ? `${definition.title} ×${count}${atLimit ? " (max)" : ""}`
            : definition.title
        }
        // Palette entries choose the next node to place rather than navigate,
        // so they carry pressed state, not selected state.
        aria-pressed={armed}
        aria-label={
          armed
            ? `${definition.title}, ${count} armed of ${MAX_PLACEMENT_COUNT}. Click to add one, right-click or minus to remove one.`
            : `${definition.title}. Click to arm for placement.`
        }
        className="h-11 gap-3 [&_svg]:size-6 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-1.5!"
      >
        <Icon />
        <span>{definition.title}</span>

        {armed && (
          // Sits in the rail too, where the label is hidden — the count is the
          // only thing distinguishing an armed batch from a plain selection.
          <span
            aria-hidden
            className="ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-4 text-primary-foreground group-data-[collapsible=icon]:absolute group-data-[collapsible=icon]:-top-0.5 group-data-[collapsible=icon]:-right-0.5 group-data-[collapsible=icon]:ml-0"
          >
            {count}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

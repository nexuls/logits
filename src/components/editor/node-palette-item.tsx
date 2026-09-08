"use client";

import { InfoIcon } from "lucide-react";
import { useState } from "react";

import { nodeIcon } from "@/components/nodes/node-icons";
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { MAX_PLACEMENT_COUNT } from "@/lib/circuit/geometry";
import type { NodeDefinition } from "@/lib/nodes/define";
import NodeDocsDialog from "./node-docs-dialog";

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
 *
 * The info action beside it opens the element's help. It is a sibling button
 * rather than something inside the menu button, because nesting a button in a
 * button is invalid HTML and would make the help unreachable by keyboard.
 */
export default function NodePaletteItem({
  definition,
  count,
  onAdjust,
}: Props) {
  const Icon = nodeIcon(definition.icon);
  const armed = count > 0;
  const atLimit = count >= MAX_PLACEMENT_COUNT;
  const [docsOpen, setDocsOpen] = useState(false);

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
        // Room on the right for the info action, which overlays the button.
        className="h-11 gap-3 pr-8 [&_svg]:size-6 group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-1.5! group-data-[collapsible=icon]:pr-1.5! group-has-data-[sidebar=menu-action]/menu-item:pr-9"
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

      {/* Shown on hover and whenever anything in the row has focus, so the
          palette stays quiet at rest but the action is still tabbable. It
          hides itself on the collapsed rail, where there is no room for it. */}
      <SidebarMenuAction
        showOnHover
        type="button"
        onClick={() => setDocsOpen(true)}
        aria-label={`About ${definition.title}`}
        aria-haspopup="dialog"
        className="size-8 text-sidebar-foreground/60"
      >
        <InfoIcon />
      </SidebarMenuAction>

      {/* Mounted only once opened: the palette renders forty of these, and
          forty dialogs' worth of derived pin tables is work for nothing. */}
      {docsOpen && (
        <NodeDocsDialog
          definition={definition}
          open={docsOpen}
          onOpenChange={setDocsOpen}
        />
      )}
    </SidebarMenuItem>
  );
}

"use client";

import { PanelRightIcon, SearchIcon } from "lucide-react";
import { type CSSProperties, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import type { NodeDefinition } from "@/lib/nodes/define";
import { nodeCategories, nodeDefinitions } from "@/lib/nodes/registry";
import NodePaletteItem from "./node-palette-item";

type Props = {
  /** Registry `type` of the node armed for placement, if any. */
  selectedType?: string | null;
  /** How many copies of it the next canvas click drops. */
  selectedCount?: number;
  /**
   * Changes the armed count by `delta` — +1 from a click, -1 from a
   * right-click. Arming a different type is the same call, so the palette
   * needs no separate "select" path.
   */
  onAdjustCount?: (type: string, delta: number) => void;
};

const OTHER_CATEGORY = { id: "other", label: "Other" } as const;

function matches(definition: NodeDefinition, needle: string): boolean {
  if (needle.length === 0) return true;

  return (
    definition.title.toLowerCase().includes(needle) ||
    definition.type.includes(needle) ||
    (definition.keywords?.some((keyword) => keyword.includes(needle)) ?? false)
  );
}

function Body({ selectedType, selectedCount = 0, onAdjustCount }: Props) {
  const { open, openMobile, isMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : open;
  const [query, setQuery] = useState("");

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const found = nodeDefinitions.filter((definition) =>
      matches(definition, needle),
    );

    // Driven off the registry's category list, not off a map in this file, so
    // a new family shows up here without touching the palette. Anything with
    // an unlisted category still appears, under "Other".
    const known = new Set(nodeCategories.map((category) => category.id));

    return [...nodeCategories, OTHER_CATEGORY as { id: string; label: string }]
      .map((category) => ({
        ...category,
        items: found.filter((definition) =>
          category.id === OTHER_CATEGORY.id
            ? !known.has(definition.category)
            : definition.category === category.id,
        ),
      }))
      .filter((category) => category.items.length > 0);
  }, [query]);

  const empty = groups.length === 0;

  return (
    <>
      <Sidebar side="right" collapsible="icon">
        <SidebarHeader className="gap-3">
          <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={isOpen ? "Collapse elements" : "Expand elements"}
              aria-expanded={isOpen}
            >
              <PanelRightIcon />
            </Button>
            <span className="text-sm font-semibold group-data-[collapsible=icon]:hidden">
              Elements
            </span>
          </div>

          <div className="relative group-data-[collapsible=icon]:hidden">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <SidebarInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search elements"
              aria-label="Search elements"
              className="pl-8"
            />
          </div>
        </SidebarHeader>

        <SidebarSeparator className="mx-0" />

        <SidebarContent>
          {groups.map((category) => (
            <SidebarGroup key={category.id}>
              <SidebarGroupLabel>{category.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {category.items.map((definition) => (
                    <NodePaletteItem
                      key={definition.type}
                      definition={definition}
                      count={
                        definition.type === selectedType ? selectedCount : 0
                      }
                      onAdjust={(delta) =>
                        onAdjustCount?.(definition.type, delta)
                      }
                    />
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          {empty && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">
              No elements match “{query.trim()}”.
            </p>
          )}
        </SidebarContent>

        <SidebarFooter>
          <p className="px-1 text-center text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            <Kbd>⌘J</Kbd> to toggle
          </p>
        </SidebarFooter>
      </Sidebar>

      {/* Below `md` the sidebar is an off-canvas sheet with no rail to click,
          so the only way in is a trigger that floats over the canvas. */}
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        onClick={toggleSidebar}
        aria-label="Show elements"
        aria-expanded={openMobile}
        className="fixed top-2 right-2 z-30 bg-sidebar md:hidden"
      >
        <PanelRightIcon />
      </Button>
    </>
  );
}

/**
 * The right-hand dock: the node palette and the selection inspector.
 *
 * It carries its own `SidebarProvider` because the page already has one for
 * the projects sidebar and the two open and close independently — hence the
 * separate cookie and shortcut. The provider wrapper is sized to its content
 * rather than `w-full`, so it sits as a column beside the canvas.
 */
export default function ElementsSidebar(props: Props) {
  return (
    <SidebarProvider
      cookieName="logits_elements_state"
      keyboardShortcut="j"
      className="h-full min-h-0 w-auto"
      style={{ "--sidebar-width": "16rem" } as CSSProperties}
    >
      <Body {...props} />
    </SidebarProvider>
  );
}

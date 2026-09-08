"use client";

import { ChevronRightIcon, DownloadIcon, SparklesIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { examples } from "@/example";

type Props = {
  activeId?: string;
  onOpen: (exampleId: string) => void;
  onImport: (exampleId: string) => void;
};

/**
 * The shipped circuits, collapsed by default.
 *
 * Opening one is a read: it loads into the editor fully editable but is never
 * written to storage, so the group sits apart from the project list rather
 * than mixed into it. "Import" is the one action that turns an example into a
 * project the user owns.
 */
export default function ExamplesGroup({ activeId, onOpen, onImport }: Props) {
  return (
    <Collapsible defaultOpen={false} className="group/examples">
      <SidebarGroup>
        <SidebarGroupLabel
          render={<CollapsibleTrigger />}
          className="w-full cursor-pointer hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <SparklesIcon className="mr-2 size-3.5" />
          Examples
          <ChevronRightIcon className="ml-auto size-4 transition-transform duration-200 group-data-[open]/examples:rotate-90" />
        </SidebarGroupLabel>

        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {examples.map((example) => (
                <SidebarMenuItem key={example.id}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={example.id === activeId}
                    onClick={() => onOpen(example.id)}
                    aria-current={example.id === activeId ? "true" : undefined}
                    className="group-has-data-[sidebar=menu-action]/menu-item:pr-10"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate px-1 font-medium">
                        {example.name}
                      </span>
                      <span className="truncate px-1 text-xs font-normal text-muted-foreground">
                        {example.summary}
                      </span>
                    </span>
                  </SidebarMenuButton>

                  <SidebarMenuAction
                    showOnHover
                    className="right-3"
                    aria-label={`Import ${example.name} as a project`}
                    title="Import as a project"
                    onClick={() => onImport(example.id)}
                  >
                    <DownloadIcon />
                  </SidebarMenuAction>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>

            <p className="px-3 pt-1 pb-2 text-xs text-muted-foreground">
              Examples open read-to-edit but are never saved. Import one to keep
              your changes.
            </p>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

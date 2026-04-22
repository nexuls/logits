"use client";

import { cn } from "@/lib/utils";

import { useTabs, useWorkspace } from "./context";

type TabViewProps = {
  paneId: string;
  className?: string;
};

/**
 * Renders the active tab's content for a pane. Clicking anywhere inside
 * focuses the pane and re-asserts selection so external state (router,
 * editor focus) tracks the tab the user interacts with.
 */
export function TabView({ paneId, className }: TabViewProps) {
  const { focusPane } = useWorkspace();
  const { getPaneTabs, getPaneActiveTabId, selectTab } = useTabs();

  const paneTabs = getPaneTabs(paneId);
  const activeTabId = getPaneActiveTabId(paneId);
  const activeTab =
    paneTabs.find((tab) => tab.id === activeTabId) ?? paneTabs[0] ?? null;

  if (!activeTab) return null;

  return (
    <div
      className={cn("h-full", className)}
      onMouseDown={() => {
        focusPane(paneId);
        selectTab(paneId, activeTab.id);
      }}
    >
      {activeTab.content}
    </div>
  );
}

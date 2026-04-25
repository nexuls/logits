"use client";

import { useEffect, useMemo, useState } from "react";

import { cn } from "@/lib/utils";

import { useTabs, useWorkspace } from "../context";

type TabViewProps = {
  paneId: string;
  className?: string;
};

const MAX_MOUNTED_PANELS_PER_PANE = 12;

/**
 * Renders the active tab's content for a pane. Clicking anywhere inside
 * focuses the pane and re-asserts selection so external state (router,
 * editor focus) tracks the tab the user interacts with.
 */
export function TabView({ paneId, className }: TabViewProps) {
  const { focusPane } = useWorkspace();
  const { getPaneTabs, getPaneActiveTabId, selectTab } = useTabs();
  const [retainedTabIds, setRetainedTabIds] = useState<string[]>([]);

  const paneTabs = getPaneTabs(paneId);
  const paneTabIds = useMemo(() => paneTabs.map((tab) => tab.id), [paneTabs]);
  const activeTabId = getPaneActiveTabId(paneId);
  const activeTab =
    paneTabs.find((tab) => tab.id === activeTabId) ?? paneTabs[0] ?? null;
  const activeRetainedTabId = activeTab?.id ?? null;

  useEffect(() => {
    if (paneTabIds.length === 0) {
      setRetainedTabIds([]);
      return;
    }

    setRetainedTabIds((currentIds) => {
      const paneIdSet = new Set(paneTabIds);
      const existingIds = currentIds.filter((tabId) => paneIdSet.has(tabId));

      const nextIds = activeRetainedTabId
        ? [
            ...existingIds.filter((tabId) => tabId !== activeRetainedTabId),
            activeRetainedTabId,
          ]
        : existingIds;

      const resultIds =
        paneTabIds.length <= MAX_MOUNTED_PANELS_PER_PANE
          ? paneTabIds
          : nextIds.slice(-MAX_MOUNTED_PANELS_PER_PANE);

      if (
        resultIds.length === currentIds.length &&
        resultIds.every((tabId, index) => tabId === currentIds[index])
      ) {
        return currentIds;
      }

      return resultIds;
    });
  }, [activeRetainedTabId, paneTabIds]);

  const retainedSet = useMemo(() => new Set(retainedTabIds), [retainedTabIds]);
  const renderedTabs = useMemo(() => {
    if (paneTabs.length <= MAX_MOUNTED_PANELS_PER_PANE) return paneTabs;
    if (!activeRetainedTabId) return [];
    return paneTabs.filter(
      (tab) => tab.id === activeRetainedTabId || retainedSet.has(tab.id),
    );
  }, [activeRetainedTabId, paneTabs, retainedSet]);

  if (!activeTab) return null;

  return (
    <div
      className={cn("h-full", className)}
      onMouseDown={() => {
        focusPane(paneId);
        selectTab(paneId, activeTab.id);
      }}
    >
      {renderedTabs.map((tab) => (
        <div key={tab.id} className={cn("h-full", tab.id !== activeTab.id && "hidden")}>
          {tab.content}
        </div>
      ))}
    </div>
  );
}

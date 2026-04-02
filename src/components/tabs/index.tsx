"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FileType } from "@/data/modules/notebook/client-types";
import { cn } from "@/lib/utils";
import Header from "./header";

export type TabsViewTab<TMeta = unknown> = {
  id: string;
  title: string;
  content: React.ReactNode;
  meta?: TMeta;
  closeable?: boolean;
};

type TabsViewChangeReason = "select" | "close" | "reorder";

export type TabsViewChange<TMeta = unknown> = {
  reason: TabsViewChangeReason;
  activeTabId: string | null;
  tabs: TabsViewTab<TMeta>[];
  tabId?: string;
};

type HeaderTab<TMeta> = {
  id: string;
  title: string;
  isActive: boolean;
  meta?: TMeta;
  closeable: boolean;
};

type TabsViewProps<TMeta = unknown> = {
  tabs: TabsViewTab<TMeta>[];
  defaultActiveTabId?: string;
  activeTabId?: string;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string) => void;
  onTabChange?: (change: TabsViewChange<TMeta>) => void;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
  panelClassName?: string;
  emptyState?: React.ReactNode;
};

function areTabOrdersEqual(first: string[], second: string[]) {
  if (first.length !== second.length) return false;

  for (let index = 0; index < first.length; index += 1) {
    if (first[index] !== second[index]) return false;
  }

  return true;
}

export default function TabsView<TMeta = unknown>({
  tabs,
  defaultActiveTabId,
  activeTabId: controlledActiveTabId,
  onTabSelect,
  onTabClose,
  onTabChange,
  className,
  headerClassName,
  contentClassName,
  panelClassName,
  emptyState,
}: TabsViewProps<TMeta>) {
  const isControlled = typeof controlledActiveTabId === "string";

  const [internalActiveTabId, setInternalActiveTabId] = useState<string | null>(
    defaultActiveTabId ?? tabs[0]?.id ?? null,
  );

  const activeTabId = isControlled
    ? (controlledActiveTabId ?? null)
    : internalActiveTabId;

  const previousOrderRef = useRef<string[]>(tabs.map((tab) => tab.id));

  const tabsById = useMemo(
    () => new Map(tabs.map((tab) => [tab.id, tab])),
    [tabs],
  );

  useEffect(() => {
    if (isControlled) return;

    setInternalActiveTabId((currentActiveTabId) => {
      if (!tabs.length) return null;
      if (currentActiveTabId && tabsById.has(currentActiveTabId)) {
        return currentActiveTabId;
      }

      return defaultActiveTabId && tabsById.has(defaultActiveTabId)
        ? defaultActiveTabId
        : (tabs[0]?.id ?? null);
    });
  }, [defaultActiveTabId, isControlled, tabs, tabsById]);

  useEffect(() => {
    const currentOrder = tabs.map((tab) => tab.id);

    if (areTabOrdersEqual(previousOrderRef.current, currentOrder)) {
      return;
    }

    previousOrderRef.current = currentOrder;
    onTabChange?.({
      reason: "reorder",
      activeTabId,
      tabs,
    });
  }, [activeTabId, onTabChange, tabs]);

  const selectTab = (tabId: string) => {
    if (!tabsById.has(tabId)) return;

    if (!isControlled) {
      setInternalActiveTabId(tabId);
    }

    onTabSelect?.(tabId);
    onTabChange?.({
      reason: "select",
      activeTabId: tabId,
      tabs,
      tabId,
    });
  };

  const closeTab = (tabId: string) => {
    if (!tabsById.has(tabId)) return;

    const currentIndex = tabs.findIndex((tab) => tab.id === tabId);
    const remainingTabs = tabs.filter((tab) => tab.id !== tabId);

    let nextActiveTabId = activeTabId;

    if (tabId === activeTabId) {
      nextActiveTabId =
        remainingTabs[currentIndex]?.id ??
        remainingTabs[currentIndex - 1]?.id ??
        remainingTabs[0]?.id ??
        null;

      if (!isControlled) {
        setInternalActiveTabId(nextActiveTabId);
      }

      if (nextActiveTabId) {
        onTabSelect?.(nextActiveTabId);
      }
    }

    onTabClose?.(tabId);
    onTabChange?.({
      reason: "close",
      activeTabId: nextActiveTabId,
      tabs: remainingTabs,
      tabId,
    });
  };

  const headerTabs: HeaderTab<TMeta>[] = tabs.map((tab) => ({
    id: tab.id,
    title: tab.title,
    isActive: tab.id === activeTabId,
    meta: tab.meta,
    closeable: tab.closeable ?? true,
  }));

  return (
    <div className={cn("min-h-0 flex h-full flex-col", className)}>
      <Header
        placeholder={false}
        className={headerClassName}
        tabs={headerTabs.map((tab) => ({
          id: tab.id,
          name: tab.title,
          type: (tab.meta as { type?: FileType } | undefined)?.type ?? "file",
          isActive: tab.isActive,
        }))}
        onTabSelect={selectTab}
        onTabClose={closeTab}
      />

      <div className={cn("min-h-0 flex-1", contentClassName)}>
        {tabs.length === 0
          ? (emptyState ?? null)
          : tabs.map((tab) => (
              <div
                key={tab.id}
                role="tabpanel"
                aria-hidden={tab.id !== activeTabId}
                className={cn(
                  "h-full",
                  tab.id === activeTabId ? "block" : "hidden",
                  panelClassName,
                )}
              >
                {tab.content}
              </div>
            ))}
      </div>
    </div>
  );
}

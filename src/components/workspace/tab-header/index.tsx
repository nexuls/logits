"use client";

import { PanelLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

import { getHeaderTabs, useTabs, useWorkspace } from "../context";
import { TabHeaderItem } from "./tab-item";
import { useTabReorder } from "./use-tab-reorder";
import { getTabIcon } from "./utils";

/**
 * Props for the TabHeader component.
 *
 * - Placeholder mode renders a static header (sidebar toggle only). It's
 *   used by shell screens that want to mirror the workspace look without
 *   any real pane context yet (e.g. the root `/` route).
 * - Linked mode binds the header to the workspace context by `paneId`.
 *   All tab interactions (select / close / reorder / drag) are wired
 *   through the workspace context automatically.
 */
export type TabHeaderPlaceholderProps = {
  placeholder: true;
  className?: string;
};

export type TabHeaderLinkedProps = {
  placeholder?: false;
  paneId: string;
  className?: string;
};

export type TabHeaderProps = TabHeaderPlaceholderProps | TabHeaderLinkedProps;

export default function TabHeader(props: TabHeaderProps) {
  if (props.placeholder) {
    return <PlaceholderTabHeader className={props.className} />;
  }
  return <LinkedTabHeader paneId={props.paneId} className={props.className} />;
}

/**
 * Non-interactive header variant. Renders the chrome with just a sidebar
 * toggle. Stays here (instead of its own file) because it shares the
 * exact outer layout/styling with the linked variant.
 */
function PlaceholderTabHeader({ className }: { className?: string }) {
  const { toggleSidebar } = useSidebar();
  return (
    <div
      className={cn(
        "border-b border-sidebar-border bg-sidebar px-2 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex h-10 w-full items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>
        <div className="min-w-0 flex-1" />
      </div>
    </div>
  );
}

/**
 * Header wired to a specific pane inside the workspace context. Renders
 * the reorderable tab row and forwards drag state / select / close
 * events through the shared context.
 */
function LinkedTabHeader({
  paneId,
  className,
}: {
  paneId: string;
  className?: string;
}) {
  const { toggleSidebar } = useSidebar();
  const { toggleButtonPaneId } = useWorkspace();
  const {
    getRenderedPaneTabs,
    getPaneActiveTabId,
    selectTab,
    closeTab,
    reorderTabs,
    onHeaderDragStateChange,
  } = useTabs();

  const paneTabs = getRenderedPaneTabs(paneId);
  const activeTabId = getPaneActiveTabId(paneId);
  const headerTabs = getHeaderTabs(paneTabs, activeTabId);
  const showSidebarToggle = paneId === toggleButtonPaneId;

  const {
    canReorder,
    orderedTabs,
    draggingTabId,
    slideOffsetX,
    setContainerRef,
    setTabRef,
    handleTabClick,
    handlePointerDown,
  } = useTabReorder({
    tabs: headerTabs,
    onTabReorder: (nextTabIds) => reorderTabs(paneId, nextTabIds),
    onTabDragStateChange: (state) => onHeaderDragStateChange(paneId, state),
  });

  return (
    <div
      className={cn(
        "border-b border-sidebar-border bg-sidebar px-2 backdrop-blur-sm",
        className,
      )}
    >
      <div className="flex h-10 w-full items-center gap-2">
        {showSidebarToggle ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => toggleSidebar()}
          >
            <PanelLeftIcon />
            <span className="sr-only">Toggle Sidebar</span>
          </Button>
        ) : null}

        <div className="flex min-w-0 flex-1 items-center justify-center truncate px-2 text-sm font-medium md:hidden">
          {orderedTabs.find((tab) => tab.isActive)?.name ?? ""}
        </div>

        <div
          ref={setContainerRef}
          className="relative hidden w-full min-w-0 grow max-w-full gap-1 -mb-0.5 md:flex"
        >
          {orderedTabs.map((tab) => {
            const Icon = getTabIcon(tab.type);
            return (
              <TabHeaderItem
                key={tab.id}
                tab={tab}
                icon={Icon}
                isSliding={draggingTabId === tab.id}
                slideOffsetX={slideOffsetX}
                canReorder={canReorder}
                setRef={(node) => setTabRef(tab.id, node)}
                onPointerDown={(event) => {
                  handlePointerDown(tab.id, event, (tabId) =>
                    selectTab(paneId, tabId),
                  );
                }}
                onSelectClick={(event) => {
                  handleTabClick(event, tab.id, (tabId) =>
                    selectTab(paneId, tabId),
                  );
                }}
                onSelectKeyUp={() => selectTab(paneId, tab.id)}
                onClose={(event) => {
                  event.stopPropagation();
                  closeTab(paneId, tab.id);
                }}
              />
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-2"></div>
      </div>
    </div>
  );
}

"use client";

import { PanelLeftIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HeaderTabItem } from "./header-tab-item";
import type { HeaderInteractiveProps, HeaderProps } from "./header-types";
import { getTabIcon } from "./header-utils";
import { useHeaderTabReorder } from "./use-header-tab-reorder";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";

function getInteractiveProps(
  props: HeaderProps,
): HeaderInteractiveProps | null {
  if (props.placeholder) return null;
  return props;
}

export default function Header(props: HeaderProps) {
  const { toggleSidebar } = useSidebar();
  const interactiveProps = getInteractiveProps(props);
  const {
    canReorder,
    orderedTabs,
    draggingTabId,
    slideOffsetX,
    setContainerRef,
    setTabRef,
    handleTabClick,
    handlePointerDown,
  } = useHeaderTabReorder({
    tabs: interactiveProps?.tabs ?? [],
    onTabReorder: interactiveProps?.onTabReorder,
  });

  return (
    <div
      className={cn(
        "border-b border-sidebar-border bg-sidebar px-2 backdrop-blur-sm",
        props.className,
      )}
    >
      <div className="flex h-10 w-full items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        {!interactiveProps ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <>
            <div
              ref={setContainerRef}
              className="relative flex w-full grow max-w-full gap-1 -mb-0.5"
            >
              {orderedTabs.map((tab) => {
                const Icon = getTabIcon(tab.type);

                return (
                  <HeaderTabItem
                    key={tab.id}
                    tab={tab}
                    icon={Icon}
                    isSliding={draggingTabId === tab.id}
                    slideOffsetX={slideOffsetX}
                    canReorder={canReorder}
                    setRef={(node) => setTabRef(tab.id, node)}
                    onPointerDown={(event) => {
                      handlePointerDown(
                        tab.id,
                        event,
                        interactiveProps.onTabSelect,
                      );
                    }}
                    onSelectClick={(event) => {
                      handleTabClick(
                        event,
                        tab.id,
                        interactiveProps.onTabSelect,
                      );
                    }}
                    onSelectKeyUp={() => interactiveProps.onTabSelect(tab.id)}
                    onClose={(event) => {
                      event.stopPropagation();
                      interactiveProps.onTabClose(tab.id);
                    }}
                  />
                );
              })}
            </div>

            <div className="flex shrink-0 items-center gap-2"></div>
          </>
        )}
      </div>
    </div>
  );
}

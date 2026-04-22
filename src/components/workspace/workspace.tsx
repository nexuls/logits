import { AnimatePresence, motion } from "motion/react";

import { cn } from "@/lib/utils";

import { useWorkspace, WorkspaceProvider } from "./context";
import { LayoutTree } from "./layout/layout-tree";
import type { WorkspaceProps } from "./types";

/**
 * Public workspace component. Acts as a controlled surface: the owner
 * passes the canonical `tabs` list and reacts to selection/close/layout
 * callbacks. Internally composes the WorkspaceProvider with the layout
 * tree and drag overlays.
 */
export default function Workspace<TMeta = unknown>(
  props: WorkspaceProps<TMeta>,
) {
  if (props.tabs.length === 0) {
    return (
      <div className={cn("h-full w-full", props.className)}>
        {props.emptyState ?? null}
      </div>
    );
  }

  return (
    <WorkspaceProvider
      tabs={props.tabs}
      activeTabId={props.activeTabId}
      defaultActiveTabId={props.defaultActiveTabId}
      initialLayout={props.initialLayout}
      emptyState={props.emptyState}
      handleRef={props.handleRef}
      onTabSelect={props.onTabSelect}
      onTabClose={props.onTabClose}
      onLayoutChange={props.onLayoutChange}
    >
      <WorkspaceRoot className={props.className} />
    </WorkspaceProvider>
  );
}

/**
 * Root DOM container for the workspace. Renders the recursive layout
 * tree plus the two drag-time overlays (drop-zone preview and the
 * floating ghost tab that follows the pointer).
 */
function WorkspaceRoot({ className }: { className?: string }) {
  const { layout, rootRef, previewRect, dragState, tabsById } = useWorkspace();

  return (
    <div
      ref={rootRef}
      className={cn("relative h-full w-full min-h-0", className)}
    >
      {layout ? <LayoutTree layout={layout} /> : null}

      <AnimatePresence>
        {previewRect ? (
          <motion.div
            key="workspace-preview"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{
              opacity: 1,
              scale: 1,
              x: previewRect.x,
              y: previewRect.y,
              width: previewRect.width,
              height: previewRect.height,
            }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18, ease: [0.2, 0, 0, 1] }}
            className="pointer-events-none absolute left-0 top-0 z-30 rounded-xl border border-primary/45 bg-primary/12 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {dragState?.hasMoved && dragState.isOutsideHeader ? (
          <div
            key={dragState.tabId}
            className="pointer-events-none absolute left-0 top-0 z-40 overflow-hidden rounded-lg border border-sidebar-border bg-background/95 shadow-lg"
            style={{
              width: dragState.tabWidth,
              height: dragState.tabHeight,
              transform: `translate3d(${
                dragState.pointerX -
                (rootRef.current?.getBoundingClientRect().left ?? 0) -
                dragState.pointerOffsetX
              }px, ${
                dragState.pointerY -
                (rootRef.current?.getBoundingClientRect().top ?? 0) -
                dragState.pointerOffsetY
              }px, 0)`,
            }}
          >
            <div className="flex h-full items-center px-3 text-sm font-medium text-foreground">
              <span className="truncate">
                {tabsById.get(dragState.tabId)?.title ?? "Moving tab"}
              </span>
            </div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

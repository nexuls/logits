"use client";

import { cn } from "@/lib/utils";

import { useWorkspace } from "./context";
import TabHeader from "./tab-header";
import { TabView } from "./tab-view";
import type { WorkspacePaneNode } from "./types";

type PaneProps = {
  pane: WorkspacePaneNode;
};

/**
 * One pane inside the workspace. Wires its DOM node + header node into
 * the workspace context (needed for drag-target resolution) and composes
 * a TabHeader and TabView for the pane's tab list.
 */
export function Pane({ pane }: PaneProps) {
  const { focusedPaneId, setPaneRef, setHeaderRef, focusPane } = useWorkspace();

  return (
    <div
      ref={(node) => setPaneRef(pane.id, node)}
      className={cn(
        "group/pane relative flex h-full min-h-0 flex-col overflow-hidden",
        focusedPaneId === pane.id && "ring-1 ring-primary/25",
      )}
      onMouseDown={() => focusPane(pane.id)}
    >
      <div ref={(node) => setHeaderRef(pane.id, node)} className="relative">
        <TabHeader paneId={pane.id} />
      </div>

      <div className="relative min-h-0 flex-1 bg-background/95">
        <TabView paneId={pane.id} />
      </div>
    </div>
  );
}

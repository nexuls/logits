"use client";

import type { HTMLAttributes } from "react";
import {
  Group as ResizablePanelGroup,
  Panel as ResizablePanel,
  Separator as ResizableHandle,
} from "react-resizable-panels";

import { cn } from "@/lib/utils";

import { Pane } from "./pane";
import type { WorkspaceLayout } from "../types";

/**
 * Divider between two children of a split. Thin hit area with a bigger
 * invisible grab region so the handle is easy to target in both
 * horizontal and vertical orientations.
 */
function WorkspaceResizeHandle(props: HTMLAttributes<HTMLDivElement>) {
  return (
    <ResizableHandle
      {...props}
      className={cn(
        "relative flex w-px items-center justify-center bg-border/70 hover:bg-sidebar-border/70",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:after:left-0",
        "aria-[orientation=horizontal]:after:h-1 aria-[orientation=horizontal]:after:w-full aria-[orientation=horizontal]:after:translate-x-0 aria-[orientation=horizontal]:after:-translate-y-1/2",
        props.className,
      )}
    ></ResizableHandle>
  );
}

/**
 * Recursively renders the workspace layout tree: split nodes become two
 * resizable panels, pane nodes become a {@link Pane}. Consumes zero
 * context itself — all pane state is owned by the workspace context.
 */
export function LayoutTree({ layout }: { layout: WorkspaceLayout }) {
  if (layout.type === "split") {
    return (
      <ResizablePanelGroup
        orientation={layout.direction}
        className="h-full w-full"
      >
        <ResizablePanel defaultSize={layout.size} minSize={24}>
          <LayoutTree layout={layout.first} />
        </ResizablePanel>
        <WorkspaceResizeHandle />
        <ResizablePanel defaultSize={100 - layout.size} minSize={24}>
          <LayoutTree layout={layout.second} />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return <Pane pane={layout} />;
}

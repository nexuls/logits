import type { MutableRefObject, ReactNode } from "react";
import type { FileType } from "@/data/modules/notebook/client-types";

/**
 * SplitDirection determines how two sub-layouts are arranged inside a
 * split node.
 * - "horizontal": children sit side-by-side (left | right).
 * - "vertical": children stack vertically (top / bottom).
 */
export type SplitDirection = "horizontal" | "vertical";

/**
 * DropSide describes where a dragged tab is being dropped relative to the
 * pane it is hovering over.
 * - "center": insert into the target pane's tab list (reorder/append).
 * - "left" | "right" | "top" | "bottom": split the pane and place the
 *   dragged tab in a new pane on that side.
 */
export type DropSide = "center" | "left" | "right" | "top" | "bottom";

/**
 * Leaf node of the workspace layout tree representing a single pane.
 * A pane owns an ordered list of tab IDs and knows which one is active.
 *
 * Invariants:
 * - A pane always contains at least one tab id in the committed tree
 *   (empty panes are pruned by {@link WorkspaceLayout} normalizers).
 * - `activeTabId` must be one of `tabIds`, or null only when the pane is
 *   transiently empty during reconciliation.
 */
export type WorkspacePaneNode = {
  id: string;
  type: "pane";
  tabIds: string[];
  activeTabId: string | null;
};

/**
 * Internal split node of the workspace layout tree. A split divides its
 * parent region into two children (`first` and `second`) along either a
 * horizontal or vertical axis.
 *
 * - `size` is the percentage share of the first child; second child
 *   occupies (100 - size).
 */
export type WorkspaceSplitNode = {
  id: string;
  type: "split";
  direction: SplitDirection;
  size: number;
  first: WorkspaceLayout;
  second: WorkspaceLayout;
};

/**
 * Discriminated union representing the full workspace layout tree.
 * Every node is either a leaf pane or a split that recursively contains
 * more panes/splits.
 */
export type WorkspaceLayout = WorkspacePaneNode | WorkspaceSplitNode;

/**
 * A single tab rendered inside the workspace.
 * - `content` is the React node shown in the TabView when this tab is
 *   active inside its pane.
 * - `meta` is an arbitrary consumer-defined payload; the tab header uses
 *   {@link WorkspaceTabMeta} to derive the icon from it.
 */
export type WorkspaceTab<TMeta = unknown> = {
  id: string;
  title: string;
  content: ReactNode;
  meta?: TMeta;
  closeable?: boolean;
};

/**
 * Legacy alias retained for backwards-compatibility with existing call
 * sites that still import `TabsViewTab`. New code should use
 * {@link WorkspaceTab} directly.
 */
export type TabsViewTab<TMeta = unknown> = WorkspaceTab<TMeta>;

/**
 * Shape of the `meta` payload the workspace itself recognises. At the
 * moment only `type` is used (to pick an icon for the tab header).
 */
export type WorkspaceTabMeta = {
  type?: FileType;
};

/**
 * Public drag state emitted from the TabHeader back to the workspace so
 * the workspace can render the floating ghost tab and resolve which pane
 * / side the pointer is currently hovering.
 */
export type HeaderDragState = {
  tabId: string;
  pointerX: number;
  pointerY: number;
  hasMoved: boolean;
  isOutsideHeader: boolean;
  pointerOffsetX: number;
  pointerOffsetY: number;
  tabWidth: number;
  tabHeight: number;
};

/**
 * Workspace-scoped drag state. Augments {@link HeaderDragState} with the
 * id of the pane the drag originated in so cross-pane drops can behave
 * differently from drops onto the source pane.
 */
export type WorkspaceDragState = HeaderDragState & {
  sourcePaneId: string;
};

/**
 * The pane (and side) currently under the drag pointer.
 * - `side === "center"` with `index` defined means: inserting into the
 *   pane's tab header at that index.
 * - `side !== "center"` means: split the pane along that edge on drop.
 */
export type HoverTarget = {
  paneId: string;
  side: DropSide;
  index?: number;
};

/**
 * Rectangle (in workspace-root-local coordinates) of the drop-preview
 * overlay drawn while a drag is in progress.
 */
export type PreviewRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Imperative handle exposed through `handleRef` so owners can drive the
 * workspace programmatically — e.g. "open this file in a split pane".
 */
export type WorkspaceHandle = {
  openInSplit: (tabId: string, side?: Exclude<DropSide, "center">) => void;
  replaceTab: (oldTabId: string, newTabId: string) => void;
};

/**
 * Props accepted by the public {@link Workspace} component. The workspace
 * is a controlled surface: owners supply the canonical tab list and
 * active selection, and react to the workspace's callbacks.
 */
export type WorkspaceProps<TMeta = unknown> = {
  tabs: WorkspaceTab<TMeta>[];
  activeTabId?: string;
  defaultActiveTabId?: string;
  initialLayout?: WorkspaceLayout | null;
  emptyState?: ReactNode;
  className?: string;
  handleRef?: MutableRefObject<WorkspaceHandle | null>;
  onTabSelect?: (tabId: string) => void;
  onTabClose?: (tabId: string, nextActiveTabId: string | null) => void;
  onLayoutChange?: (layout: WorkspaceLayout | null) => void;
};

/**
 * Visual shape of one tab inside the tab header row. Derived from
 * {@link WorkspaceTab} + the active tab id of the containing pane.
 */
export type HeaderTab = {
  id: string;
  name: string;
  type: FileType;
  isActive: boolean;
};

/**
 * Pointer-capture state tracked during an in-flight header reorder
 * gesture. Persisted on a ref (not state) because it updates on every
 * pointer move and should not trigger re-renders.
 */
export type HeaderPointerState = {
  tabId: string;
  initialOrder: string[];
  startClientX: number;
  startClientY: number;
  pointerId: number;
  swapAnchorX: number;
  hasMoved: boolean;
  lastClientX: number;
  lastClientY: number;
  pointerOffsetX: number;
  pointerOffsetY: number;
  tabWidth: number;
  tabHeight: number;
};

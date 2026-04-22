import type { FileType } from "@/data/modules/notebook/client-types";

export type HeaderTab = {
  id: string;
  name: string;
  type: FileType;
  isActive: boolean;
};

export type HeaderPlaceholderProps = {
  placeholder: true;
  className?: string;
};

export type HeaderInteractiveProps = {
  placeholder: false;
  className?: string;
  showSidebarToggle?: boolean;
  tabs: HeaderTab[];
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder?: (tabIds: string[]) => void;
  onTabDragStateChange?: (state: HeaderDragState | null) => void;
};

export type HeaderProps = HeaderPlaceholderProps | HeaderInteractiveProps;

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

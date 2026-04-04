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
  tabs: HeaderTab[];
  onTabSelect: (tabId: string) => void;
  onTabClose: (tabId: string) => void;
  onTabReorder?: (tabIds: string[]) => void;
};

export type HeaderProps = HeaderPlaceholderProps | HeaderInteractiveProps;

export type HeaderPointerState = {
  tabId: string;
  initialOrder: string[];
  startClientX: number;
  pointerId: number;
  swapAnchorX: number;
  hasMoved: boolean;
};

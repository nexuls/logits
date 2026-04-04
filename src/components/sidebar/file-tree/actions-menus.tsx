import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type MenuItemComponent = ComponentType<{
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}>;

export type MenuSeparatorComponent = ComponentType<Record<string, never>>;

type ActionMenuRenderer = {
  Item: MenuItemComponent;
  Separator: MenuSeparatorComponent;
};

type ActionMenuContextProps = {
  children: ReactNode;
  contentClassName?: string;
  renderActions: (renderer: ActionMenuRenderer) => ReactNode;
};

type ActionMenuDropdownProps = {
  ariaLabel: string;
  trigger: ReactNode;
  contentClassName?: string;
  buttonClassName?: string;
  buttonVariant?: "ghost" | "outline";
  buttonSize?: "icon-xs" | "sm";
  renderActions: (renderer: ActionMenuRenderer) => ReactNode;
  stopPropagation?: boolean;
};

export function FileTreeContextActionMenu({
  children,
  contentClassName = "w-44",
  renderActions,
}: ActionMenuContextProps) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        className={cn(contentClassName, "data-[state=open]:duration-75")}
      >
        {renderActions({
          Item: ContextMenuItem,
          Separator: ContextMenuSeparator,
        })}
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function FileTreeDropdownActionMenu({
  ariaLabel,
  trigger,
  contentClassName = "w-44",
  buttonClassName,
  buttonVariant = "ghost",
  buttonSize = "icon-xs",
  renderActions,
  stopPropagation = true,
}: ActionMenuDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={buttonVariant}
          size={buttonSize}
          className={buttonClassName}
          aria-label={ariaLabel}
          onClick={(event) => {
            if (stopPropagation) {
              event.stopPropagation();
            }
          }}
          onPointerDown={(event) => {
            if (stopPropagation) {
              event.stopPropagation();
            }
          }}
        >
          {trigger}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={cn(contentClassName, "data-[state=open]:duration-75")}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
        }}
        onClick={(event) => {
          if (stopPropagation) {
            event.stopPropagation();
          }
        }}
        onPointerDown={(event) => {
          if (stopPropagation) {
            event.stopPropagation();
          }
        }}
      >
        {renderActions({
          Item: DropdownMenuItem,
          Separator: DropdownMenuSeparator,
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

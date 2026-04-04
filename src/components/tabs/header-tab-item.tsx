import type { MouseEvent, PointerEvent as ReactPointerEvent } from "react";
import type { LucideIcon } from "lucide-react";
import { XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HeaderTab } from "./header-types";

type HeaderTabItemProps = {
  tab: HeaderTab;
  icon: LucideIcon;
  isSliding: boolean;
  slideOffsetX: number;
  canReorder: boolean;
  setRef: (node: HTMLDivElement | null) => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onSelectClick: (event: MouseEvent<HTMLDivElement>) => void;
  onSelectKeyUp: () => void;
  onClose: (event: MouseEvent<HTMLButtonElement>) => void;
};

export function HeaderTabItem({
  tab,
  icon: Icon,
  isSliding,
  slideOffsetX,
  canReorder,
  setRef,
  onPointerDown,
  onSelectClick,
  onSelectKeyUp,
  onClose,
}: HeaderTabItemProps) {
  return (
    <div
      ref={setRef}
      onPointerDown={onPointerDown}
      className={cn(
        "relative flex grow shrink max-w-64 pt-1 transition-transform",
        tab.isActive && "z-0 h-10",
        canReorder && "touch-none",
        isSliding && "z-10 cursor-grabbing",
      )}
      style={
        isSliding
          ? {
              transform: `translateX(${slideOffsetX}px)`,
              transition: "none",
            }
          : undefined
      }
    >
      <div
        onClick={onSelectClick}
        onKeyUp={(event) => {
          if (event.key === "Enter" || event.key === " ") onSelectKeyUp();
        }}
        aria-label={`Select ${tab.name} tab`}
        role="button"
        tabIndex={0}
        className={cn(
          "group relative w-full z-0 flex items-center gap-1 pr-0.5 text-sm transition-[background-color]",
          "border-x border-t",
          tab.isActive
            ? "h-9 pb-1 rounded-t-lg border-border      bg-background  text-foreground transition-none"
            : "h-8      rounded-lg   border-transparent bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          tab.isActive &&
            "before:size-4 before:absolute before:bottom-0 before:-left-4 before:rounded-full" +
              " before:[clip-path:inset(50%_-2px_-2px_50%)] before:[box-shadow:inset_0_0_0_1px_var(--border),0_0_0_6px_var(--background)]",
          tab.isActive &&
            "after:size-4 after:absolute after:bottom-0 after:-right-4 after:rounded-full" +
              " after:[clip-path:inset(50%_50%_-2px_-2px)] after:[box-shadow:inset_0_0_0_1px_var(--border),0_0_0_6px_var(--background)]",
          isSliding && "pointer-events-none",
        )}
      >
        <div className="flex flex-1 min-w-0 items-center gap-2 px-3 cursor-pointer">
          <Icon className="size-4 shrink-0" />
          <span className="max-w-40 truncate font-medium">{tab.name}</span>
        </div>

        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onClose}
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-sm transition-colors cursor-pointer",
            tab.isActive
              ? "text-muted-foreground hover:bg-accent hover:text-foreground"
              : "text-muted-foreground/80 hover:bg-accent hover:text-foreground",
          )}
          aria-label={`Close ${tab.name}`}
        >
          <XIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

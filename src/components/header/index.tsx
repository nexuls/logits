"use client";

import {
  FileIcon,
  FileImageIcon,
  FilePenLineIcon,
  PanelLeftIcon,
  XIcon,
} from "lucide-react";
import type { FileType } from "@/data/schema";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { useSidebar } from "../ui/sidebar";

type HeaderTab = {
  id: string;
  name: string;
  type: FileType;
  isActive: boolean;
};

type Props =
  | {
      placeholder: true;
      className?: string;
    }
  | {
      placeholder: false;
      className?: string;
      notebookName: string;
      currentFileName?: string;
      tabs: HeaderTab[];
      onTabSelect: (tabId: string) => void;
      onTabClose: (tabId: string) => void;
    };

function getTabIcon(type: FileType) {
  if (type === "image") {
    return FileImageIcon;
  }

  if (type === "draw") {
    return FilePenLineIcon;
  }

  return FileIcon;
}

export default function Header(props: Props) {
  const { toggleSidebar } = useSidebar();

  return (
    <div
      className={cn(
        "border-b border-border bg-sidebar px-2 backdrop-blur-sm",
        props.className,
      )}
    >
      <div className="flex h-10 w-full items-center gap-2">
        <Button variant="ghost" size="icon-sm" onClick={() => toggleSidebar()}>
          <PanelLeftIcon />
          <span className="sr-only">Toggle Sidebar</span>
        </Button>

        {"placeholder" in props && props.placeholder ? (
          <div className="min-w-0 flex-1" />
        ) : (
          <>
            <div className="relative flex w-full grow max-w-full gap-1 -mb-0.5">
              {props.tabs.map((tab) => {
                const Icon = getTabIcon(tab.type);

                return (
                  <div
                    key={tab.id}
                    className={cn(
                      "relative flex pt-1 border-b border-border",
                      tab.isActive && "z-0 h-10",
                    )}
                  >
                    {/** biome-ignore lint/a11y/useSemanticElements: cannot use nested buttons */}
                    <div
                      onClick={() => props.onTabSelect(tab.id)}
                      onKeyUp={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          props.onTabSelect(tab.id);
                        }
                      }}
                      aria-label={`Select ${tab.name} tab`}
                      role="button"
                      tabIndex={0}
                      className={cn(
                        "group relative z-0 flex items-center gap-1 pr-0.5 text-sm transition-[background-color]",
                        "border-x border-t",
                        tab.isActive
                          ? "h-9 pb-1 rounded-t-lg border-border bg-background text-foreground"
                          : "h-8 rounded-lg border-transparent bg-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                        tab.isActive &&
                          "before:size-4 before:absolute before:bottom-0 before:-left-4 before:rounded-full" +
                            " before:[clip-path:inset(50%_-2px_-2px_50%)] before:[box-shadow:inset_0_0_0_1px_var(--border),0_0_0_6px_var(--background)]",
                        tab.isActive &&
                          "after:size-4 after:absolute after:bottom-0 after:-right-4 after:rounded-full" +
                            " after:[clip-path:inset(50%_50%_-2px_-2px)] after:[box-shadow:inset_0_0_0_1px_var(--border),0_0_0_6px_var(--background)]",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2 px-3 cursor-pointer">
                        <Icon className="size-4 shrink-0" />
                        <span className="max-w-40 truncate font-medium">
                          {tab.name}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          props.onTabClose(tab.id);
                        }}
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
              })}
            </div>

            <div className="flex shrink-0 items-center gap-2"></div>
          </>
        )}
      </div>
    </div>
  );
}

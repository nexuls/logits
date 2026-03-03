"use client";

import { CableIcon, Pencil, PanelsTopLeft } from "lucide-react";
import { SidebarHeader } from "@/components/ui/sidebar";

export function AppSidebarHeader() {
  return (
    <SidebarHeader className="px-3 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded">
            <CableIcon className="size-5" />
          </div>
          <span className="text-base font-semibold leading-none">Logits</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => console.info("[placeholder] edit workspace")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Edit workspace"
          >
            <Pencil className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => console.info("[placeholder] change sidebar layout")}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Change sidebar layout"
          >
            <PanelsTopLeft className="size-4" />
          </button>
        </div>
      </div>
    </SidebarHeader>
  );
}

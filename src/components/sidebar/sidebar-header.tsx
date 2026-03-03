"use client";

import { CableIcon, PanelsTopLeft, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMetadata } from "@/components/providers/metadata";
import { SidebarHeader } from "@/components/ui/sidebar";

export function AppSidebarHeader() {
  const router = useRouter();
  const { createProject } = useMetadata();

  const onCreateProject = async () => {
    const createdProject = await createProject();

    if (createdProject) {
      router.push(`/p/${createdProject.id}`);
    }
  };

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
            onClick={() => {
              void onCreateProject();
            }}
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label="Create project"
          >
            <PlusIcon className="size-4" />
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

"use client";

import { SidebarFooter } from "@/components/ui/sidebar";
import { NavUser } from "./nav-user";

export function AppSidebarFooter() {
  return (
    <SidebarFooter className="mt-auto px-2 pb-3">
      {/* <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-3">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" />
          Logits Notes
        </div>
        <p className="text-sm font-medium text-sidebar-foreground">
          Organize notebooks, folders, and notes in one local-first workspace.
        </p>
        <Button
          size="sm"
          className="mt-3 h-8 w-full"
          onClick={() => console.info("[placeholder] notes banner click")}
        >
          Explore workflows
        </Button>
      </div> */}

      <NavUser
        user={{
          name: "Arif Sardar",
          email: "arifsardar.private@gmail.com",
          avatar:
            "https://www.nexul.in/_next/image?url=https%3A%2F%2Fres.cloudinary.com%2Fdjoo8ogmp%2Fimage%2Fupload%2Fw_96%2Fv1704147032%2Fuploaded%2Fme_pvex7c.webp&w=64&q=75",
        }}
      />
    </SidebarFooter>
  );
}

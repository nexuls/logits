"use client";

import Canvas from "@/components/canvas";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function Home() {
  return (
    <SidebarProvider className="h-svh min-h-0">
      <ProjectsSidebar />
      <SidebarInset className="relative min-w-0 overflow-hidden">
        <Canvas content="" title="Untitled circuit" />
      </SidebarInset>
    </SidebarProvider>
  );
}

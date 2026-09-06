"use client";

import { useState } from "react";

import Canvas from "@/components/canvas";
import ProjectsSidebar from "@/components/projects/projects-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function Home() {
  const [title, setTitle] = useState("Untitled circuit");

  return (
    <SidebarProvider className="h-svh min-h-0">
      <ProjectsSidebar />
      <SidebarInset className="relative min-w-0 overflow-hidden">
        <Canvas content="" title={title} onTitleChange={setTitle} />
      </SidebarInset>
    </SidebarProvider>
  );
}

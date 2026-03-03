import type React from "react";
import { TooltipProvider } from "../ui/tooltip";
import { Toaster } from "../ui/sonner";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "../sidebar/app-sidebar";

type Props = {
  children?: React.ReactNode;
};

export default function BaseProvider({ children }: Props) {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar />
        {children}
        <Toaster />
      </SidebarProvider>
    </TooltipProvider>
  );
}

import type React from "react";
import { AppSidebar } from "../sidebar/app-sidebar";
import { DataProvider } from "./data";
import { Toaster } from "../ui/sonner";
import { SidebarProvider } from "../ui/sidebar";
import { TooltipProvider } from "../ui/tooltip";

type Props = {
  children?: React.ReactNode;
};

export default function BaseProvider({ children }: Props) {
  return (
    <TooltipProvider>
      <DataProvider>
        <SidebarProvider>
          <AppSidebar />
          {children}
          <Toaster />
        </SidebarProvider>
      </DataProvider>
    </TooltipProvider>
  );
}

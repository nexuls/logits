"use client";

import { createContext, useContext, type ReactNode } from "react";

type TabViewMode = "editor" | "preview";

type WorkspaceCommandsContextValue = {
  openInSplit: (fileId: string, mode: TabViewMode) => void;
  replaceCurrentTab: (fileId: string, mode?: TabViewMode) => void;
};

const WorkspaceCommandsContext =
  createContext<WorkspaceCommandsContextValue | null>(null);

export function WorkspaceCommandsProvider({
  value,
  children,
}: {
  value: WorkspaceCommandsContextValue;
  children: ReactNode;
}) {
  return (
    <WorkspaceCommandsContext.Provider value={value}>
      {children}
    </WorkspaceCommandsContext.Provider>
  );
}

export function useWorkspaceCommands() {
  return useContext(WorkspaceCommandsContext);
}

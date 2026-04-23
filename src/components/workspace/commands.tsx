"use client";

import { createContext, useContext, type ReactNode } from "react";

type WorkspaceCommandsContextValue = {
  openInSplit: (fileId: string, viewName: string) => void;
  replaceCurrentTab: (fileId: string, viewName?: string) => void;
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

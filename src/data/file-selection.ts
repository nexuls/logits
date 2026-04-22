"use client";

import {
  createElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { buildNotebookUrl } from "@/lib/notebook-url";

type TabViewMode = "editor" | "preview";

type FileSelectionContextValue = {
  notebookId: string;
  selectedFileId: string;
  selectedTabMode: TabViewMode;
  selectFile: (fileId: string, mode?: TabViewMode) => void;
  clearSelection: () => void;
};

const FileSelectionContext = createContext<FileSelectionContextValue | null>(
  null,
);

function readFileIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("file") ?? "";
}

function readTabModeFromUrl(): TabViewMode {
  if (typeof window === "undefined") return "editor";
  return new URLSearchParams(window.location.search).has("preview")
    ? "preview"
    : "editor";
}

export function FileSelectionProvider({
  children,
  notebookId,
}: {
  children: ReactNode;
  notebookId: string;
}) {
  const [selectedFileId, setSelectedFileId] = useState(readFileIdFromUrl);
  const [selectedTabMode, setSelectedTabMode] =
    useState<TabViewMode>(readTabModeFromUrl);

  // Re-sync when navigating to a different notebook via Next.js router
  // biome-ignore lint/correctness/useExhaustiveDependencies: we only want to re-run this when the notebookId changes, not when the URL changes
  useEffect(() => {
    setSelectedFileId(readFileIdFromUrl());
    setSelectedTabMode(readTabModeFromUrl());
  }, [notebookId]);

  const selectFile = useCallback(
    (fileId: string, mode?: TabViewMode) => {
      const targetMode = mode ?? "editor";
      setSelectedFileId(fileId);
      setSelectedTabMode(targetMode);

      const params = new URLSearchParams(window.location.search);
      if (targetMode === "preview") params.set("preview", "1");
      else params.delete("preview");

      window.history.replaceState(
        null,
        "",
        buildNotebookUrl(notebookId, { fileId, searchParams: params }),
      );
    },
    [notebookId],
  );

  const clearSelection = useCallback(() => {
    setSelectedFileId("");
    setSelectedTabMode("editor");
    window.history.replaceState(null, "", buildNotebookUrl(notebookId));
  }, [notebookId]);

  // Sync on browser back/forward
  useEffect(() => {
    const onPopState = () => {
      setSelectedFileId(readFileIdFromUrl());
      setSelectedTabMode(readTabModeFromUrl());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value = useMemo(
    () => ({
      notebookId,
      selectedFileId,
      selectedTabMode,
      selectFile,
      clearSelection,
    }),
    [notebookId, selectedFileId, selectedTabMode, selectFile, clearSelection],
  );

  return createElement(FileSelectionContext.Provider, { value }, children);
}

export function useFileSelection() {
  const context = useContext(FileSelectionContext);

  if (!context) {
    throw new Error(
      "useFileSelection must be used inside FileSelectionProvider",
    );
  }

  return context;
}

export type { TabViewMode };

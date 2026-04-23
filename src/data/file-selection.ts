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

const DEFAULT_VIEW_NAME = "editor";

type FileSelectionContextValue = {
  notebookId: string;
  selectedFileId: string;
  selectedViewName: string;
  selectFile: (fileId: string, viewName?: string) => void;
  clearSelection: () => void;
};

const FileSelectionContext = createContext<FileSelectionContextValue | null>(
  null,
);

function readFileIdFromUrl() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("file") ?? "";
}

function readViewNameFromUrl(): string {
  if (typeof window === "undefined") return DEFAULT_VIEW_NAME;
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view");
  if (view) return view;
  // Backwards compatibility for the legacy `?preview=1` flag.
  if (params.has("preview")) return "preview";
  return DEFAULT_VIEW_NAME;
}

export function FileSelectionProvider({
  children,
  notebookId,
}: {
  children: ReactNode;
  notebookId: string;
}) {
  const [selectedFileId, setSelectedFileId] = useState(readFileIdFromUrl);
  const [selectedViewName, setSelectedViewName] =
    useState<string>(readViewNameFromUrl);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-sync only on notebookId change
  useEffect(() => {
    setSelectedFileId(readFileIdFromUrl());
    setSelectedViewName(readViewNameFromUrl());
  }, [notebookId]);

  const selectFile = useCallback(
    (fileId: string, viewName?: string) => {
      const targetView = viewName ?? DEFAULT_VIEW_NAME;
      setSelectedFileId(fileId);
      setSelectedViewName(targetView);

      const params = new URLSearchParams(window.location.search);
      params.delete("preview");
      if (targetView !== DEFAULT_VIEW_NAME) params.set("view", targetView);
      else params.delete("view");

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
    setSelectedViewName(DEFAULT_VIEW_NAME);
    window.history.replaceState(null, "", buildNotebookUrl(notebookId));
  }, [notebookId]);

  useEffect(() => {
    const onPopState = () => {
      setSelectedFileId(readFileIdFromUrl());
      setSelectedViewName(readViewNameFromUrl());
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value = useMemo(
    () => ({
      notebookId,
      selectedFileId,
      selectedViewName,
      selectFile,
      clearSelection,
    }),
    [notebookId, selectedFileId, selectedViewName, selectFile, clearSelection],
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

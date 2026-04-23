"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import {
  DEFAULT_CURSOR_META,
  type CursorMeta,
} from "@/workspace-views/markdown-editor/editor";
import Footer, { updateFooter } from "@/components/footer/index";
import { Spinner } from "@/components/ui/spinner";
import Workspace, {
  type TabsViewTab,
  type WorkspaceHandle,
  type WorkspaceLayout,
} from "@/components/workspace";
import { WorkspaceCommandsProvider } from "@/components/workspace/commands";
import { updateRecentNotebookShortcutsCookie } from "@/data/modules/app/cookie";
import { useNotebooks } from "@/hooks/use-notebooks";
import { useFileSelection } from "@/data/file-selection";
import type { AppFile } from "@/data/modules/notebook/client-types";

import { getEditorFileTab } from "./get-editor-file-tab";
import { getEditorFilePreviewTab } from "./get-editor-file-preview-tab";
import { NotebookEmptyState, renderEmptyState } from "./state-views";
import { parseTabId, readStoredTabIds, readStoredWorkspaceLayout } from "./utils";

// Keep file ordering stable and predictable in tab/open file logic.
const getNotebookTree = (files: AppFile[]) =>
  [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder)
      return first.metadata.fileOrder - second.metadata.fileOrder;

    return first.name.localeCompare(second.name);
  });

type TabViewMode = "editor" | "preview";
type OpenTab = {
  tabId: string;
  file: AppFile;
  mode: TabViewMode;
};

type MixedTabMeta = {
  type: AppFile["metadata"]["type"];
  view: TabViewMode;
  fileId: string;
};

export const getNotebookTabStorageKey = (notebookId: string) =>
  `logits:open-tabs:${notebookId}`;
export const getNotebookWorkspaceStorageKey = (notebookId: string) =>
  `logits:workspace-layout:${notebookId}`;
export const getTabId = (fileId: string, mode: TabViewMode) =>
  `${mode}:${fileId}`;

export default function Holder({ slug }: { slug: string }) {
  const { selectedFileId, selectedTabMode, selectFile, clearSelection } =
    useFileSelection();
  const { notebooks, isHydrating, getNotebookFiles } = useNotebooks();

  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [workspaceLayout, setWorkspaceLayout] =
    useState<WorkspaceLayout | null>(null);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);
  const cursorMetaRef = useRef<Record<string, CursorMeta>>({});
  const workspaceHandleRef = useRef<WorkspaceHandle | null>(null);

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === slug) ?? null,
    [notebooks, slug],
  );

  useEffect(() => {
    if (!selectedNotebook) return;

    updateRecentNotebookShortcutsCookie({
      notebookId: selectedNotebook.id,
      notebookName: selectedNotebook.name,
    });
  }, [selectedNotebook]);

  // Derive files for current notebook and openable files for tab logic.
  const { notebookFiles, openableFiles, firstOpenableFile } = useMemo(() => {
    if (!selectedNotebook)
      return { notebookFiles: [], openableFiles: [], firstOpenableFile: null };

    const notebookFiles = getNotebookFiles(selectedNotebook.id);

    const openableFiles = notebookFiles.filter(
      (file) => file.metadata.type !== "folder",
    );
    const firstOpenableFile = getNotebookTree(openableFiles)[0] ?? null;

    return { notebookFiles, openableFiles, firstOpenableFile };
  }, [getNotebookFiles, selectedNotebook]);

  const selectedTabId = selectedFileId
    ? getTabId(selectedFileId, selectedTabMode)
    : "";
  const selectedFile = useMemo(
    () => notebookFiles.find((file) => file.id === selectedFileId) ?? null,
    [notebookFiles, selectedFileId],
  );

  const openTabs = useMemo<OpenTab[]>(() => {
    const filesById = new Map(openableFiles.map((file) => [file.id, file]));

    return openTabIds
      .map((tabId) => {
        const parsed = parseTabId(tabId);
        if (!parsed) return null;

        const file = filesById.get(parsed.fileId);
        if (!file) return null;

        return {
          tabId,
          file,
          mode: parsed.mode,
        };
      })
      .filter((tab): tab is OpenTab => Boolean(tab));
  }, [openTabIds, openableFiles]);

  const openInSplit = useCallback((fileId: string, mode: TabViewMode) => {
    const tabId = getTabId(fileId, mode);
    setOpenTabIds((currentTabIds) =>
      currentTabIds.includes(tabId) ? currentTabIds : [...currentTabIds, tabId],
    );
    workspaceHandleRef.current?.openInSplit(tabId, "right");
  }, []);

  const selectedTabIdRef = useRef(selectedTabId);
  useEffect(() => {
    selectedTabIdRef.current = selectedTabId;
  }, [selectedTabId]);

  const replaceCurrentTab = useCallback(
    (fileId: string, mode: TabViewMode = "editor") => {
      const nextTabId = getTabId(fileId, mode);
      const currentTabId = selectedTabIdRef.current;

      setOpenTabIds((currentTabIds) => {
        if (!currentTabId || currentTabId === nextTabId) {
          return currentTabIds.includes(nextTabId)
            ? currentTabIds
            : [...currentTabIds, nextTabId];
        }

        if (currentTabIds.includes(nextTabId)) {
          return currentTabIds.filter((tabId) => tabId !== currentTabId);
        }

        const currentIndex = currentTabIds.indexOf(currentTabId);
        if (currentIndex === -1) return [...currentTabIds, nextTabId];

        const nextTabs = [...currentTabIds];
        nextTabs.splice(currentIndex, 1, nextTabId);
        return nextTabs;
      });

      if (currentTabId && currentTabId !== nextTabId) {
        workspaceHandleRef.current?.replaceTab(currentTabId, nextTabId);
      }

      selectFile(fileId, mode);
    },
    [selectFile],
  );

  const workspaceCommands = useMemo(
    () => ({ openInSplit, replaceCurrentTab }),
    [openInSplit, replaceCurrentTab],
  );

  const navigateToTab = useCallback(
    (tabId: string) => {
      const parsed = parseTabId(tabId);
      if (!parsed) return;
      selectFile(parsed.fileId, parsed.mode);
    },
    [selectFile],
  );

  // Restore persisted tabs for notebook.
  useEffect(() => {
    setOpenTabIds(readStoredTabIds(slug));
    setWorkspaceLayout(readStoredWorkspaceLayout(slug));
    setLoadedTabsSlug(slug);
  }, [slug]);

  // Persist tabs after restoring initial state for current notebook.
  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsSlug !== slug) {
      return;
    }

    window.localStorage.setItem(
      getNotebookTabStorageKey(slug),
      JSON.stringify(openTabIds),
    );
  }, [loadedTabsSlug, openTabIds, slug]);

  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsSlug !== slug) {
      return;
    }

    if (!workspaceLayout) {
      window.localStorage.removeItem(getNotebookWorkspaceStorageKey(slug));
      return;
    }

    window.localStorage.setItem(
      getNotebookWorkspaceStorageKey(slug),
      JSON.stringify(workspaceLayout),
    );
  }, [loadedTabsSlug, slug, workspaceLayout]);

  // Keep local refs and tabs aligned with available files.
  useEffect(() => {
    if (isHydrating || loadedTabsSlug !== slug) return;

    const validFileIds = new Set(openableFiles.map((file) => file.id));

    setOpenTabIds((currentTabs) =>
      currentTabs.filter((tabId) => {
        const parsed = parseTabId(tabId);
        if (!parsed) return false;

        return validFileIds.has(parsed.fileId);
      }),
    );
  }, [isHydrating, loadedTabsSlug, openableFiles, slug]);

  // Ensure URL-selected tab exists; if not, prepend it so URL intent stays primary.
  useEffect(() => {
    if (isHydrating || loadedTabsSlug !== slug) return;
    if (!selectedFile || selectedFile.metadata.type === "folder") {
      return;
    }

    setOpenTabIds((currentTabs) =>
      currentTabs.includes(selectedTabId)
        ? currentTabs
        : [...currentTabs, selectedTabId],
    );
  }, [isHydrating, loadedTabsSlug, selectedFile, selectedTabId, slug]);

  // Select a fallback file when current selection points to a missing file.
  useEffect(() => {
    if (!selectedNotebook || selectedFile) return;

    const fallbackTabId =
      openTabIds[openTabIds.length - 1] ??
      (firstOpenableFile ? getTabId(firstOpenableFile.id, "editor") : "");

    if (!fallbackTabId) return;

    const parsedFallback = parseTabId(fallbackTabId);
    if (!parsedFallback) return;

    selectFile(parsedFallback.fileId, parsedFallback.mode);
  }, [
    firstOpenableFile,
    openTabIds,
    selectFile,
    selectedFile,
    selectedNotebook,
  ]);

  useEffect(() => {
    updateFooter("cursor", {
      line: 1,
      col: 1,
      selection: 0,
    });
    updateFooter("others", {
      tabSize: 2,
      saveStatus: "saved",
    });
  }, []);

  useEffect(() => {
    if (!selectedTabId) {
      const fallbackCursorMeta = DEFAULT_CURSOR_META;

      updateFooter("cursor", {
        line: fallbackCursorMeta.line,
        col: fallbackCursorMeta.col,
        selection: fallbackCursorMeta.selection,
      });
      updateFooter("others", {
        tabSize: fallbackCursorMeta.tabSize,
      });
      return;
    }

    const activeCursorMeta =
      cursorMetaRef.current[selectedTabId] ?? DEFAULT_CURSOR_META;

    updateFooter("cursor", {
      line: activeCursorMeta.line,
      col: activeCursorMeta.col,
      selection: activeCursorMeta.selection,
    });
    updateFooter("others", {
      tabSize: activeCursorMeta.tabSize,
    });
  }, [selectedTabId]);

  const tabs = useMemo<TabsViewTab<MixedTabMeta>[]>(
    () =>
      selectedNotebook
        ? openTabs.map((tab) => {
            if (tab.mode === "preview") {
              return getEditorFilePreviewTab({
                tabId: tab.tabId,
                file: tab.file,
              });
            }

            return getEditorFileTab({
              tabId: tab.tabId,
              file: tab.file,
              cursorMetaRef,
            });
          })
        : [],
    [openTabs, selectedNotebook],
  );

  const activeCursorMeta =
    cursorMetaRef.current[selectedTabId] ?? DEFAULT_CURSOR_META;

  if (isHydrating) {
    return (
      <div className="relative h-dvh w-full bg-background">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!selectedNotebook) {
    return (
      <div className="relative h-dvh w-full bg-background">
        <NotebookEmptyState
          icon={<TriangleAlertIcon />}
          title="Notebook not found."
          description="It may have been deleted or the link is out of date."
        />
      </div>
    );
  }

  const hasAnyFiles = notebookFiles.length > 0;
  const emptyState = renderEmptyState(
    hasAnyFiles,
    selectedFile,
    openTabs.map((tab) => tab.file),
  );

  const closeTab = (tabId: string, nextActiveTabId: string | null) => {
    setOpenTabIds((currentTabs) => {
      if (!currentTabs.includes(tabId)) return currentTabs;

      return currentTabs.filter((currentTabId) => currentTabId !== tabId);
    });

    if (selectedTabId !== tabId) return;

    if (nextActiveTabId) {
      const parsed = parseTabId(nextActiveTabId);
      if (parsed) {
        selectFile(parsed.fileId, parsed.mode);
        return;
      }
    }

    clearSelection();
  };

  return (
    <div className="relative h-dvh w-[calc(100%-var(--sidebar-width))] flex-1 flex flex-col bg-background">
      <main className="min-h-0 w-full flex-1">
        <WorkspaceCommandsProvider value={workspaceCommands}>
          <Workspace
            key={`${slug}:${loadedTabsSlug ?? "pending"}`}
            tabs={tabs}
            activeTabId={selectedTabId || undefined}
            defaultActiveTabId={
              firstOpenableFile
                ? getTabId(firstOpenableFile.id, "editor")
                : undefined
            }
            initialLayout={workspaceLayout}
            handleRef={workspaceHandleRef}
            emptyState={
              emptyState ? (
                <NotebookEmptyState
                  icon={emptyState.icon}
                  title={emptyState.title}
                  description={emptyState.description}
                />
              ) : undefined
            }
            onTabSelect={navigateToTab}
            onTabClose={closeTab}
            onLayoutChange={setWorkspaceLayout}
          />
        </WorkspaceCommandsProvider>
      </main>

      <Footer
        view={selectedFile?.metadata.type === "file" ? "markdown" : "other"}
        markdownMeta={
          selectedFile?.metadata.type === "file"
            ? {
                lines: 0,
                chars: 0,
                words: 0,
                line: activeCursorMeta.line,
                col: activeCursorMeta.col,
                tabSize: activeCursorMeta.tabSize,
                selection: activeCursorMeta.selection,
                version: "v0.1.0",
                saveStatus: "saved",
              }
            : undefined
        }
      />
    </div>
  );
}

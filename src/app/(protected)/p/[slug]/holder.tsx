"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TriangleAlertIcon } from "lucide-react";

import { Spinner } from "@/components/ui/spinner";
import Footer, { updateFooter } from "@/components/footer/index";
import Workspace, {
  type TabsViewTab,
  type WorkspaceHandle,
  type WorkspaceLayout,
} from "@/components/workspace";
import type { AppFile } from "@/data/modules/notebook/client-types";

import { buildTabId, parseTabId } from "@/workspace-views/tab-id";
import { DEFAULT_WORKSPACE_VIEW } from "@/workspace-views/registry";
import type { WorkspaceViewMeta } from "@/workspace-views/types";
import { buildWorkspaceViewTab } from "@/workspace-views/host";
import {
  NotebookEmptyState,
  renderEmptyState,
} from "@/workspace-views/empty-states";

import {
  CursorMetaProvider,
  useCursorMetaStore,
} from "@/components/markdown-editor/cursor-meta";
import { WorkspaceCommandsProvider } from "@/components/workspace/commands";
import { useFileSelection } from "@/data/file-selection";
import { useNotebooks } from "@/hooks/use-notebooks";

import { DEFAULT_CURSOR_META } from "@/components/markdown-editor/editor";
import { updateRecentNotebookShortcutsCookie } from "@/data/modules/app/cookie";
import {
  getNotebookTabStorageKey,
  getNotebookWorkspaceStorageKey,
  readStoredTabIds,
  readStoredWorkspaceLayout,
} from "./storage";

const getNotebookTree = (files: AppFile[]) =>
  [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder)
      return first.metadata.fileOrder - second.metadata.fileOrder;

    return first.name.localeCompare(second.name);
  });

export default function Holder({ slug }: { slug: string }) {
  return (
    <CursorMetaProvider>
      <HolderInner slug={slug} />
    </CursorMetaProvider>
  );
}

function HolderInner({ slug }: { slug: string }) {
  const { selectedFileId, selectedViewName, selectFile, clearSelection } =
    useFileSelection();
  const { notebooks, isHydrating, getNotebookFiles } = useNotebooks();
  const cursorMetaStore = useCursorMetaStore();

  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [workspaceLayout, setWorkspaceLayout] =
    useState<WorkspaceLayout | null>(null);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);
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
    ? buildTabId(selectedViewName, selectedFileId)
    : "";
  const selectedFile = useMemo(
    () => notebookFiles.find((file) => file.id === selectedFileId) ?? null,
    [notebookFiles, selectedFileId],
  );

  const openableFilesById = useMemo(
    () => new Map(openableFiles.map((file) => [file.id, file])),
    [openableFiles],
  );

  const openInSplit = useCallback((fileId: string, viewName: string) => {
    const tabId = buildTabId(viewName, fileId);
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
    (fileId: string, viewName: string = DEFAULT_WORKSPACE_VIEW) => {
      const nextTabId = buildTabId(viewName, fileId);
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

      selectFile(fileId, viewName);
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
      selectFile(parsed.fileId, parsed.viewName);
    },
    [selectFile],
  );

  useEffect(() => {
    setOpenTabIds(readStoredTabIds(slug));
    setWorkspaceLayout(readStoredWorkspaceLayout(slug));
    setLoadedTabsSlug(slug);
  }, [slug]);

  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsSlug !== slug) return;

    window.localStorage.setItem(
      getNotebookTabStorageKey(slug),
      JSON.stringify(openTabIds),
    );
  }, [loadedTabsSlug, openTabIds, slug]);

  useEffect(() => {
    if (typeof window === "undefined" || loadedTabsSlug !== slug) return;

    if (!workspaceLayout) {
      window.localStorage.removeItem(getNotebookWorkspaceStorageKey(slug));
      return;
    }

    window.localStorage.setItem(
      getNotebookWorkspaceStorageKey(slug),
      JSON.stringify(workspaceLayout),
    );
  }, [loadedTabsSlug, slug, workspaceLayout]);

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

  useEffect(() => {
    if (isHydrating || loadedTabsSlug !== slug) return;
    if (!selectedFile || selectedFile.metadata.type === "folder") return;

    setOpenTabIds((currentTabs) =>
      currentTabs.includes(selectedTabId)
        ? currentTabs
        : [...currentTabs, selectedTabId],
    );
  }, [isHydrating, loadedTabsSlug, selectedFile, selectedTabId, slug]);

  useEffect(() => {
    if (!selectedNotebook || selectedFile) return;

    const fallbackTabId =
      openTabIds[openTabIds.length - 1] ??
      (firstOpenableFile
        ? buildTabId(DEFAULT_WORKSPACE_VIEW, firstOpenableFile.id)
        : "");

    if (!fallbackTabId) return;

    const parsedFallback = parseTabId(fallbackTabId);
    if (!parsedFallback) return;

    selectFile(parsedFallback.fileId, parsedFallback.viewName);
  }, [
    firstOpenableFile,
    openTabIds,
    selectFile,
    selectedFile,
    selectedNotebook,
  ]);

  useEffect(() => {
    updateFooter("cursor", { line: 1, col: 1, selection: 0 });
    updateFooter("others", { tabSize: 2, saveStatus: "saved" });
  }, []);

  useEffect(() => {
    if (!selectedTabId) {
      const fallback = DEFAULT_CURSOR_META;
      updateFooter("cursor", {
        line: fallback.line,
        col: fallback.col,
        selection: fallback.selection,
      });
      updateFooter("others", { tabSize: fallback.tabSize });
      return;
    }

    const activeCursorMeta = cursorMetaStore.read(selectedTabId);
    updateFooter("cursor", {
      line: activeCursorMeta.line,
      col: activeCursorMeta.col,
      selection: activeCursorMeta.selection,
    });
    updateFooter("others", { tabSize: activeCursorMeta.tabSize });
  }, [selectedTabId, cursorMetaStore]);

  const tabs = useMemo<TabsViewTab<WorkspaceViewMeta>[]>(() => {
    if (!selectedNotebook) return [];

    return openTabIds.flatMap((tabId) => {
      const parsed = parseTabId(tabId);
      if (!parsed) return [];

      const file = openableFilesById.get(parsed.fileId);
      if (!file) return [];

      const tab = buildWorkspaceViewTab(tabId, file);
      return tab ? [tab] : [];
    });
  }, [openTabIds, openableFilesById, selectedNotebook]);

  const activeCursorMeta = cursorMetaStore.read(selectedTabId);

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
  const openTabFiles = openTabIds
    .map((tabId) => {
      const parsed = parseTabId(tabId);
      if (!parsed) return null;
      return openableFilesById.get(parsed.fileId) ?? null;
    })
    .filter((file): file is AppFile => Boolean(file));

  const emptyState = renderEmptyState(hasAnyFiles, selectedFile, openTabFiles);

  const closeTab = (tabId: string, nextActiveTabId: string | null) => {
    setOpenTabIds((currentTabs) => {
      if (!currentTabs.includes(tabId)) return currentTabs;
      return currentTabs.filter((currentTabId) => currentTabId !== tabId);
    });

    if (selectedTabId !== tabId) return;

    if (nextActiveTabId) {
      const parsed = parseTabId(nextActiveTabId);
      if (parsed) {
        selectFile(parsed.fileId, parsed.viewName);
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
                ? buildTabId(DEFAULT_WORKSPACE_VIEW, firstOpenableFile.id)
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

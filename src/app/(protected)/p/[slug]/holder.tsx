"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { TriangleAlertIcon } from "lucide-react";

import {
  DEFAULT_CURSOR_META,
  type CursorMeta,
} from "@/components/editor/markdown-editor";
import Footer, { updateFooter } from "@/components/footer/index";
import Header from "@/components/tabs/header";
import { Spinner } from "@/components/ui/spinner";
import TabsView from "@/components/tabs";
import type { TabsViewTab } from "@/components/tabs";
import { getTextStats } from "@/components/editor/utils";

import { useNotebooks } from "@/hooks/use-notebooks";
import type { AppFile } from "@/data/modules/notebook/client-types";
import { buildNotebookUrl } from "@/lib/notebook-url";

import { getEditorFileTab } from "./get-editor-file-tab";
import { getEditorFilePreviewTab } from "./get-editor-file-preview-tab";
import { NotebookEmptyState, renderEmptyState } from "./helper";

// Keep file ordering stable and predictable in tab/open file logic.
const getNotebookTree = (files: AppFile[]) =>
  [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder)
      return first.metadata.fileOrder - second.metadata.fileOrder;

    return first.name.localeCompare(second.name);
  });

const getNotebookTabStorageKey = (notebookId: string) =>
  `logits:open-tabs:${notebookId}`;

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

const getTabId = (fileId: string, mode: TabViewMode) => `${mode}:${fileId}`;

function parseTabId(
  tabId: string,
): { mode: TabViewMode; fileId: string } | null {
  const [rawMode, ...rest] = tabId.split(":");
  const fileId = rest.join(":");
  if (!fileId) return null;

  if (rawMode === "editor" || rawMode === "preview") {
    return { mode: rawMode, fileId };
  }

  return { mode: "editor", fileId: tabId };
}

function readStoredTabIds(notebookId: string) {
  if (typeof window === "undefined") return [];

  const storedTabs = window.localStorage.getItem(
    getNotebookTabStorageKey(notebookId),
  );

  if (!storedTabs) return [];

  try {
    const parsedTabs = JSON.parse(storedTabs);
    if (!Array.isArray(parsedTabs)) return [];

    return parsedTabs
      .map((rawTabId) => {
        if (typeof rawTabId !== "string") return null;
        const parsed = parseTabId(rawTabId);
        return parsed ? getTabId(parsed.fileId, parsed.mode) : null;
      })
      .filter((tabId): tabId is string => Boolean(tabId));
  } catch {
    return [];
  }
}

export default function Holder({ slug }: { slug: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { notebooks, isHydrating, getNotebookFiles } = useNotebooks();

  const [openTabIds, setOpenTabIds] = useState<string[]>([]);
  const [loadedTabsSlug, setLoadedTabsSlug] = useState<string | null>(null);
  const cursorMetaRef = useRef<Record<string, CursorMeta>>({});

  const selectedNotebook = useMemo(
    () => notebooks.find((notebook) => notebook.id === slug) ?? null,
    [notebooks, slug],
  );

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

  // Derive selected file from query param for direct linking and navigation.
  const selectedFileId = searchParams.get("file") ?? "";
  const isPreviewTabView = searchParams.has("preview");
  const selectedTabMode: TabViewMode = isPreviewTabView ? "preview" : "editor";
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

  const navigateToFile = useCallback(
    (fileId: string, mode?: TabViewMode) => {
      if (!selectedNotebook) return;

      const nextParams = new URLSearchParams(searchParams.toString());
      const targetMode = mode ?? selectedTabMode;

      if (targetMode === "preview") {
        nextParams.set("preview", "1");
      } else {
        nextParams.delete("preview");
      }

      router.push(
        buildNotebookUrl(selectedNotebook.id, {
          fileId,
          searchParams: nextParams,
        }),
      );
    },
    [router, searchParams, selectedNotebook, selectedTabMode],
  );

  const navigateToTab = useCallback(
    (tabId: string) => {
      const parsed = parseTabId(tabId);
      if (!parsed) return;

      navigateToFile(parsed.fileId, parsed.mode);
    },
    [navigateToFile],
  );

  // Restore persisted tabs for notebook.
  useEffect(() => {
    setOpenTabIds(readStoredTabIds(slug));
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

  // Redirect to a fallback file when query param points to a missing file.
  useEffect(() => {
    if (!selectedNotebook || selectedFile) {
      return;
    }

    const fallbackTabId =
      openTabIds[openTabIds.length - 1] ??
      (firstOpenableFile ? getTabId(firstOpenableFile.id, "editor") : "");

    if (!fallbackTabId) {
      return;
    }

    const parsedFallback = parseTabId(fallbackTabId);
    if (!parsedFallback) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    if (parsedFallback.mode === "preview") nextParams.set("preview", "1");
    else nextParams.delete("preview");

    router.replace(
      buildNotebookUrl(selectedNotebook.id, {
        fileId: parsedFallback.fileId,
        searchParams: nextParams,
      }),
    );
  }, [
    firstOpenableFile,
    openTabIds,
    router,
    selectedFile,
    selectedNotebook,
    searchParams,
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
            const navigateByTabMode = (fileId: string) =>
              navigateToFile(fileId, tab.mode);

            if (tab.mode === "preview") {
              return getEditorFilePreviewTab({
                tabId: tab.tabId,
                file: tab.file,
                selectedNotebook,
                notebookFiles,
                navigateToFile: navigateByTabMode,
              });
            }

            return getEditorFileTab({
              tabId: tab.tabId,
              file: tab.file,
              isActive: tab.tabId === selectedTabId,
              cursorMetaRef,
              selectedNotebook,
              notebookFiles,
              navigateToFile: navigateByTabMode,
            });
          })
        : [],
    [navigateToFile, notebookFiles, openTabs, selectedNotebook, selectedTabId],
  );

  const activeDraftContent = selectedFile?.content ?? "";
  const markdownStats = useMemo(
    () => getTextStats(activeDraftContent),
    [activeDraftContent],
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
        <Header placeholder />
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

  const closeTab = (tabId: string) => {
    setOpenTabIds((currentTabs) => {
      const currentIndex = currentTabs.indexOf(tabId);

      if (currentIndex === -1) {
        return currentTabs;
      }

      const nextTabs = currentTabs.filter(
        (currentTabId) => currentTabId !== tabId,
      );

      if (selectedTabId === tabId) {
        const fallbackTabId =
          currentTabs[currentIndex + 1] ?? currentTabs[currentIndex - 1] ?? "";

        if (fallbackTabId) {
          navigateToTab(fallbackTabId);
        } else {
          router.push(buildNotebookUrl(selectedNotebook.id));
        }
      }

      return nextTabs;
    });
  };

  const reorderTabs = (nextTabIds: string[]) => {
    setOpenTabIds((currentTabIds) => {
      if (currentTabIds.length !== nextTabIds.length) {
        return currentTabIds;
      }

      const currentIdSet = new Set(currentTabIds);
      if (nextTabIds.some((tabId) => !currentIdSet.has(tabId))) {
        return currentTabIds;
      }

      const hasOrderChanged = nextTabIds.some(
        (tabId, index) => currentTabIds[index] !== tabId,
      );

      if (!hasOrderChanged) {
        return currentTabIds;
      }

      return nextTabIds;
    });
  };

  return (
    <div className="relative h-dvh w-[calc(100%-var(--sidebar-width))] flex-1 flex flex-col bg-background">
      <main className="min-h-0 w-full flex-1">
        {emptyState ? (
          <>
            <Header
              placeholder={false}
              tabs={openTabs.map((file) => ({
                id: file.tabId,
                name:
                  file.mode === "preview"
                    ? `${file.file.name} (Preview)`
                    : file.file.name,
                type: file.file.metadata.type,
                isActive: file.tabId === selectedTabId,
              }))}
              onTabSelect={navigateToTab}
              onTabClose={closeTab}
              onTabReorder={reorderTabs}
            />

            <NotebookEmptyState
              icon={emptyState.icon}
              title={emptyState.title}
              description={emptyState.description}
            />
          </>
        ) : (
          <TabsView
            tabs={tabs}
            activeTabId={selectedTabId}
            defaultActiveTabId={
              firstOpenableFile
                ? getTabId(firstOpenableFile.id, "editor")
                : undefined
            }
            onTabSelect={navigateToTab}
            onTabClose={closeTab}
            onTabReorder={reorderTabs}
          />
        )}
      </main>

      <Footer
        view={selectedFile?.metadata.type === "file" ? "markdown" : "other"}
        markdownMeta={
          selectedFile?.metadata.type === "file"
            ? {
                ...markdownStats,
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

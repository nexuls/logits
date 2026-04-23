/**
 * Bridge between a stored tab id and a renderable {@link TabsViewTab}.
 *
 * Holders own the list of open tab ids; this helper resolves each id to the
 * right view from the registry, applies the unsupported-state fallback, and
 * builds the tab descriptor consumed by `<Workspace />`.
 */

import type { TabsViewTab } from "@/components/workspace";
import type { AppFile } from "@/data/modules/notebook/client-types";

import { NotebookEmptyState } from "./empty-states";
import { getWorkspaceView } from "./registry";
import { parseTabId } from "./tab-id";
import type { WorkspaceViewMeta } from "./types";

/**
 * Returns `null` when the tab id is malformed or its view has been removed
 * from the registry — the caller should treat both as "drop the tab".
 */
export function buildWorkspaceViewTab(
  tabId: string,
  file: AppFile,
): TabsViewTab<WorkspaceViewMeta> | null {
  const parsed = parseTabId(tabId);
  if (!parsed) return null;

  const view = getWorkspaceView(parsed.viewName);
  if (!view) return null;

  const meta: WorkspaceViewMeta = {
    fileType: file.metadata.type,
    view: view.name,
    fileId: file.id,
  };

  // Render the view's declared fallback (e.g. "folder selected") in place
  // of the body so the tab still appears in the strip.
  const unsupported = view.getUnsupportedState?.(file) ?? null;
  if (unsupported) {
    return {
      id: tabId,
      title: view.getTitle(file),
      meta,
      content: (
        <NotebookEmptyState
          key={tabId}
          icon={unsupported.icon}
          title={unsupported.title}
          description={unsupported.description}
        />
      ),
    };
  }

  const Component = view.Component;
  return {
    id: tabId,
    title: view.getTitle(file),
    meta,
    content: (
      <Component
        key={tabId}
        tabId={tabId}
        fileId={file.id}
        params={parsed.params}
      />
    ),
  };
}

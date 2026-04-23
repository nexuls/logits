/**
 * Central registry of available workspace views.
 *
 * To add a new view:
 *   1. Implement a {@link WorkspaceView} in `./views/<name>-view.tsx`.
 *   2. Import it here and add it to the `views` array below.
 * The host (`./host.tsx`) and the tab-id parser (`./tab-id.ts`) will pick it
 * up automatically — no other wiring is required.
 *
 * View names are persisted (in tab-id storage and the URL), so renaming an
 * existing view is a breaking change.
 */

import type { WorkspaceView } from "./types";
import { editorView } from "./views/editor-view";
import { previewView } from "./views/preview-view";

const views: WorkspaceView[] = [editorView, previewView];

export const workspaceViews: Record<string, WorkspaceView> = Object.fromEntries(
  views.map((view) => [view.name, view]),
);

/**
 * Default view used when no view name is supplied (e.g. clicking a file in
 * the sidebar). Must always exist in the registry.
 */
export const DEFAULT_WORKSPACE_VIEW = editorView.name;

export function getWorkspaceView(name: string): WorkspaceView | null {
  return workspaceViews[name] ?? null;
}

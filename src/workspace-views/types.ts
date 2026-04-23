/**
 * Workspace view contract.
 *
 * A "workspace view" is one way of rendering an open file inside the workspace
 * tab strip — for example, the markdown editor or its preview. Every view is
 * registered once in {@link ./registry} under a unique {@link WorkspaceView.name}
 * which is then encoded into the tab id (see {@link ./tab-id}).
 *
 * Adding a new view is intentionally cheap: implement a `WorkspaceView`,
 * register it, and the workspace will route tabs to it automatically.
 */

import type { ComponentType, ReactNode } from "react";

import type { AppFile } from "@/data/modules/notebook/client-types";

/**
 * Props passed to every view's `Component`.
 *
 * Views deliberately receive the bare minimum (an identifier and any params
 * parsed from the tab id) and must reach for hooks (`useNotebooks`,
 * `useFileSelection`, etc.) for everything else. This keeps view callers from
 * having to know what each view needs.
 */
export type WorkspaceViewProps = {
  /** The full tab id, e.g. `"editor:abc123"`. Useful as a stable React key. */
  tabId: string;
  /** The file id this tab is bound to. */
  fileId: string;
  /**
   * Extra parameters parsed from the optional third tab-id segment.
   * Empty when the tab id only carries `viewName:fileId`.
   */
  params: Record<string, string>;
};

/**
 * Metadata attached to a {@link TabsViewTab} so workspace consumers can reason
 * about the tab without re-parsing its id.
 */
export type WorkspaceViewMeta = {
  fileType: AppFile["metadata"]["type"];
  view: string;
  fileId: string;
};

/**
 * A fallback shown in place of the view body when a view declines a file
 * (returned from {@link WorkspaceView.getUnsupportedState}).
 */
export type ViewUnsupportedState = {
  icon: ReactNode;
  title: string;
  description: string;
};

/**
 * Definition of a single workspace view. Registered values are looked up by
 * `name`, so the name must be unique across the registry and stable across
 * releases (it is persisted in tab-id storage and the URL).
 */
export type WorkspaceView = {
  /** Unique identifier — encoded into the tab id and stored in URLs. */
  name: string;
  /** Tab title for the file as shown in the tab strip. */
  getTitle: (file: AppFile) => string;
  /**
   * Optional gate. Return a {@link ViewUnsupportedState} to render a fallback
   * instead of the view body — e.g. the editor view rejects folders/images.
   */
  getUnsupportedState?: (file: AppFile) => ViewUnsupportedState | null;
  /**
   * The view body. Should pull data through hooks rather than relying on
   * extra props beyond {@link WorkspaceViewProps}.
   */
  Component: ComponentType<WorkspaceViewProps>;
};

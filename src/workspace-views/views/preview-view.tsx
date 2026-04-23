"use client";

/**
 * Read-only markdown preview workspace view.
 *
 * Loads the latest saved content for `fileId` from IDB once on mount and
 * re-fetches when the file id changes. Lives independently of the editor view
 * so split-pane "edit + preview" keeps two separate IDB reads — fine because
 * `getFileContent` hits the same cache.
 */

import { useEffect, useState } from "react";

import Preview from "@/components/markdown-editor/preview";
import { useNotebooks } from "@/hooks/use-notebooks";

import { getTextFileUnsupportedState } from "../empty-states";
import type { WorkspaceView, WorkspaceViewProps } from "../types";

const VIEW_NAME = "preview";

function PreviewViewContent({ fileId }: WorkspaceViewProps) {
  const { getFileContent } = useNotebooks();
  const [content, setContent] = useState("");

  useEffect(() => {
    let isCancelled = false;

    void getFileContent(fileId).then((storedContent) => {
      if (isCancelled) return;
      setContent(storedContent);
    });

    return () => {
      isCancelled = true;
    };
  }, [fileId, getFileContent]);

  return <Preview content={content} />;
}

export const previewView: WorkspaceView = {
  name: VIEW_NAME,
  getTitle: (file) => `${file.name} (Preview)`,
  getUnsupportedState: (file) =>
    getTextFileUnsupportedState(file.metadata.type),
  Component: PreviewViewContent,
};

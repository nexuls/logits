"use client";

import { SquarePenIcon } from "lucide-react";

import { ToolbarTooltip } from "@/components/editor/simulation-controls";
import { PROJECT_PARAM } from "@/components/projects/use-project-route";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { CircuitDocument } from "@/lib/circuit/schema";
import { createProjectFrom } from "@/state/projects-store";

type Props = {
  /** The circuit on screen, copied as it stands. */
  document: CircuitDocument;
};

/**
 * Takes the circuit out of a preview and into the editor: a copy saved to this
 * browser's projects, opened in a new tab.
 *
 * Saved rather than opened ephemerally, which is what `/?p=<example id>` would
 * do for an example ([ADR 0008](artifacts/decisions/0008-examples-are-ephemeral.md)):
 * the point of leaving a preview for the editor is to change the circuit, and
 * an ephemeral copy loses those edits on close. For a `#data=` link it is the
 * only way in at all — the document exists nowhere but that URL.
 *
 * A new tab because a preview may be an `<iframe>` on someone else's page,
 * where navigating in place would put the editor inside a frame the size of a
 * figure. The caller owns where this sits; it draws only the button.
 */
export default function OpenInEditorButton({ document }: Props) {
  const openInEditor = () => {
    const result = createProjectFrom(document);
    if (!result.ok) {
      toast.add({ title: result.error, type: "error" });
      return;
    }

    // Opened without the `noopener` feature, which is specified to return
    // null and would hide a blocked popup behind the same value. The new tab
    // is same-origin and ours, so severing `opener` afterwards is enough.
    const tab = window.open(
      `/?${PROJECT_PARAM}=${encodeURIComponent(result.id)}`,
      "_blank",
    );
    if (tab) tab.opener = null;

    toast.add({
      title: "Saved to your projects.",
      description: tab
        ? "Opened in a new tab."
        : "Your browser blocked the new tab — open it from the projects sidebar.",
      type: "success",
    });
  };

  return (
    <ToolbarTooltip label="Save a copy and edit it in a new tab">
      <Button
        type="button"
        variant="default"
        onClick={openInEditor}
        aria-label="Open in editor: save a copy to your projects and edit it in a new tab"
      >
        <SquarePenIcon />
        <span className="hidden sm:inline">Open in editor</span>
      </Button>
    </ToolbarTooltip>
  );
}

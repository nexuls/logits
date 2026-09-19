"use client";

import { Share2Icon } from "lucide-react";

import { ToolbarTooltip } from "@/components/editor/simulation-controls";
import { copyExampleLink } from "@/components/projects/project-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getExample } from "@/example";
import OpenInEditorButton from "./open-in-editor-button";

type Props = {
  /** A document id in the bundled example catalog. */
  exampleId: string;
};

/**
 * The two things you can do with an example you are looking at: send it to
 * someone, or start changing it.
 *
 * One corner chip rather than a component each, as the editor's `ShareButton`
 * is: these two share a corner, and two absolutely positioned siblings would
 * each have to know how wide the other is.
 *
 * The catalog is looked up here rather than on the server so the page can pass
 * an id: the circuit is already in this bundle, and serialising it into the
 * payload a second time to hand it over as a prop would be the whole document
 * twice for nothing.
 */
export default function ExamplePreviewActions({ exampleId }: Props) {
  const example = getExample(exampleId);
  // Unreachable from the route, which 404s an id that is not an example.
  if (!example) return null;

  const share = () => {
    copyExampleLink(exampleId).then((result) =>
      toast.add({
        title: result.message,
        description: result.ok
          ? "Anyone with it opens this example, running."
          : undefined,
        type: result.ok ? "success" : "error",
      }),
    );
  };

  return (
    // Level with the toolbar, where the editor puts Share. Nothing else claims
    // this corner in a preview, and the toolbar's narrow-canvas rail starts
    // below it.
    <div className="absolute top-2 right-2 z-30 flex items-center gap-2">
      <ToolbarTooltip label="Copy a link to this example">
        <Button
          type="button"
          variant="secondary"
          onClick={share}
          aria-label="Share: copy a link to this example"
        >
          <Share2Icon />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </ToolbarTooltip>

      <OpenInEditorButton document={example.document} />
    </div>
  );
}

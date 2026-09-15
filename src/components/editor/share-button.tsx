"use client";

import { Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToolbarTooltip } from "./simulation-controls";

type Props = {
  disabled: boolean;
  onShare: () => void;
};

/**
 * Copies the open circuit's `/preview` link, from the top-right corner level
 * with the toolbar. Its own chip rather than a toolbar button: the toolbar is
 * centred and already as wide as a phone, and sharing is not a simulation or
 * editing control.
 */
export default function ShareButton({ disabled, onShare }: Props) {
  return (
    // Clear of the elements-sidebar trigger, which takes this corner below `md`.
    <div className="pointer-events-auto absolute top-2 right-12 z-20 rounded-lg px-1.5 py-1 md:right-2">
      <ToolbarTooltip label="Copy an embeddable link">
        <Button
          type="button"
          variant="default"
          disabled={disabled}
          onClick={onShare}
          aria-label="Share: copy an embeddable link"
        >
          <Share2Icon />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </ToolbarTooltip>
    </div>
  );
}

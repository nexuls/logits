"use client";

import { useId } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE } from "@/lib/circuit/coords";
import { setOpenDocumentDefaultZoom, useDocument } from "@/state/document";

/**
 * Settings that belong to the open circuit rather than to the workspace.
 *
 * The counterpart to `editor-settings-panel.tsx`: everything here is in the
 * save format, travels with an exported file, and goes through a document
 * command so undo and autosave cover it. Renders nothing with no circuit open.
 */

const MIN_PERCENT = Math.round(MIN_SCALE * 100);
const MAX_PERCENT = Math.round(MAX_SCALE * 100);

export default function ProjectSettingsPanel() {
  const document = useDocument();
  const id = useId();

  if (!document) return null;

  const percent = Math.round((document.defaultZoom ?? DEFAULT_SCALE) * 100);

  const commit = (raw: string) => {
    const next = Number.parseFloat(raw);
    // A cleared or unparseable field is not an edit — leave the stored zoom
    // alone rather than reading the empty string as 0 and clamping to 5%.
    if (!Number.isFinite(next)) return;
    setOpenDocumentDefaultZoom(next / 100);
  };

  return (
    <div className="group-data-[collapsible=icon]:hidden">
      <SidebarGroup>
        <SidebarGroupLabel>Project</SidebarGroupLabel>
        <SidebarGroupContent className="space-y-1.5 px-3 py-1">
          <Label htmlFor={id} className="text-xs">
            Default zoom
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={MIN_PERCENT}
              max={MAX_PERCENT}
              step={10}
              // Uncontrolled, remounted when the stored value changes, so
              // typing "5" on the way to "50" is not clamped to the minimum
              // mid-keystroke. The key also picks up an undo of this edit.
              key={`${document.id}:${percent}`}
              defaultValue={percent}
              onBlur={(event) => commit(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commit(event.currentTarget.value);
              }}
              className="h-8"
              aria-describedby={`${id}-hint`}
            />
            <span aria-hidden className="text-xs text-muted-foreground">
              %
            </span>
          </div>
          <p id={`${id}-hint`} className="text-[11px] text-muted-foreground">
            Scale this circuit opens at, and what “reset view” returns to. Saved
            with the project.
          </p>
        </SidebarGroupContent>
      </SidebarGroup>
    </div>
  );
}

"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import EditorSettingsPanel from "./editor-settings-panel";
import ProjectSettingsPanel from "./project-settings-panel";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * Workspace and project settings, in one dialog.
 *
 * They used to sit at the bottom of the elements sidebar, where they competed
 * with the palette for the same scroll. Opened from the canvas header menu.
 */
export default function SettingsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Workspace preferences, and settings saved with this circuit.
          </DialogDescription>
        </DialogHeader>

        <EditorSettingsPanel />

        <Separator />

        <ProjectSettingsPanel />
      </DialogContent>
    </Dialog>
  );
}

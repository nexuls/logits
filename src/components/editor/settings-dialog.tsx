"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocument } from "@/state/document";
import EditorSettingsPanel from "./editor-settings-panel";
import ProjectSettingsPanel from "./project-settings-panel";

export type SettingsSection = "preferences" | "project";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
};

/**
 * Workspace preferences and the open circuit's settings, one tab each.
 *
 * They used to sit at the bottom of the elements sidebar, where they competed
 * with the palette for the same scroll. Opened from the canvas header menu,
 * which names the tab — so the section is controlled from outside.
 */
export default function SettingsDialog({
  open,
  onOpenChange,
  section,
  onSectionChange,
}: Props) {
  const document = useDocument();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-4">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Workspace preferences, and settings saved with this circuit.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={section}
          onValueChange={(value) => onSectionChange(value as SettingsSection)}
        >
          <TabsList className="w-full">
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="project">Project</TabsTrigger>
          </TabsList>

          <TabsContent value="preferences" className="flex flex-col gap-4 pt-2">
            <EditorSettingsPanel />
          </TabsContent>

          <TabsContent value="project" className="pt-2">
            {document ? (
              <ProjectSettingsPanel />
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Open a circuit to change its settings.
              </p>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

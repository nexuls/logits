"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ProjectMeta } from "@/lib/circuit/schema";
import { flushSave, getRootDocument } from "@/state/document";
import { deleteProject } from "@/state/projects-store";
import type { StorageResult } from "@/state/storage";

type Props = {
  /** The project awaiting confirmation; null keeps the dialog closed. */
  project: Pick<ProjectMeta, "id" | "name"> | null;
  onClose: () => void;
  onDeleted: (result: StorageResult, projectId: string) => void;
};

/**
 * The one confirmation in front of deleting a project, shared by the projects
 * sidebar and the canvas header menu.
 */
export default function DeleteProjectDialog({
  project,
  onClose,
  onDeleted,
}: Props) {
  const confirm = () => {
    if (!project) return;

    // An edit still waiting on the autosave would be written when the editor
    // lets go of this document — straight back into storage, resurrecting the
    // project that was just deleted. Writing it first leaves nothing pending.
    if (getRootDocument()?.id === project.id) flushSave();

    onDeleted(deleteProject(project.id), project.id);
    onClose();
  };

  return (
    <AlertDialog
      open={project !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{project?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the circuit from this browser. It cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

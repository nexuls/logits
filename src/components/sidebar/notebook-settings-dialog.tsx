"use client";

import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type Props = {
  open: boolean;
  notebookName: string;
  draftName: string;
  deleteDisabled: boolean;
  onDraftNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onSave: () => void;
};

export function NotebookSettingsDialog({
  open,
  notebookName,
  draftName,
  deleteDisabled,
  onDraftNameChange,
  onOpenChange,
  onDelete,
  onSave,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Notebook Settings</DialogTitle>
          <DialogDescription>
            Rename this notebook or remove it from your workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="notebook-name"
              className="text-sm font-medium text-foreground"
            >
              Notebook name
            </label>
            <Input
              id="notebook-name"
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="Enter notebook name"
            />
          </div>

          <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
            <div className="mb-1 text-sm font-medium text-foreground">
              Delete notebook
            </div>
            <p className="text-xs text-muted-foreground">
              This removes {notebookName} and its files from the local
              workspace.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="mt-3"
              disabled={deleteDisabled}
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
              Delete Notebook
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSave}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

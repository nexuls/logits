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
import { Switch } from "@/components/ui/switch";

export type CreateNotebookOptions = {
  openAfterCreate: boolean;
  createStarterFile: boolean;
};

type BaseProps = {
  open: boolean;
  draftName: string;
  onDraftNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
};

type EditProps = BaseProps & {
  mode: "edit";
  notebookName: string;
  deleteDisabled: boolean;
  onDelete: () => void;
};

type CreateProps = BaseProps & {
  mode: "create";
  createOptions: CreateNotebookOptions;
  onCreateOptionsChange: (options: CreateNotebookOptions) => void;
};

type Props = EditProps | CreateProps;

export function NotebookSettingsDialog(props: Props) {
  const {
    mode,
    open,
    draftName,
    onDraftNameChange,
    onOpenChange,
    onSubmit,
  } = props;
  const isCreateMode = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isCreateMode ? "Create Notebook" : "Notebook Settings"}
          </DialogTitle>
          <DialogDescription>
            {isCreateMode
              ? "Choose a notebook name and creation options."
              : "Rename this notebook or remove it from your workspace."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor="notebook-name"
              className="text-sm font-medium text-foreground"
            >
              {isCreateMode ? "Notebook name" : "Rename notebook"}
            </label>
            <Input
              id="notebook-name"
              value={draftName}
              onChange={(event) => onDraftNameChange(event.target.value)}
              placeholder="Enter notebook name"
            />
          </div>

          {isCreateMode ? (
            <div className="space-y-3 rounded-xl border border-sidebar-border bg-sidebar/30 p-3">
              <div className="text-sm font-medium text-foreground">
                Notebook options
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">Open after create</p>
                  <p className="text-xs text-muted-foreground">
                    Navigate to the notebook immediately after creation.
                  </p>
                </div>
                <Switch
                  checked={props.createOptions.openAfterCreate}
                  onCheckedChange={(checked) => {
                    props.onCreateOptionsChange({
                      ...props.createOptions,
                      openAfterCreate: Boolean(checked),
                    });
                  }}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-foreground">Create starter file</p>
                  <p className="text-xs text-muted-foreground">
                    Adds a first markdown file named Welcome.
                  </p>
                </div>
                <Switch
                  checked={props.createOptions.createStarterFile}
                  onCheckedChange={(checked) => {
                    props.onCreateOptionsChange({
                      ...props.createOptions,
                      createStarterFile: Boolean(checked),
                    });
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
              <div className="mb-1 text-sm font-medium text-foreground">
                Delete notebook
              </div>
              <p className="text-xs text-muted-foreground">
                This removes {props.notebookName} and its files from the local
                workspace.
              </p>
              <Button
                type="button"
                variant="destructive"
                className="mt-3"
                disabled={props.deleteDisabled}
                onClick={props.onDelete}
              >
                <Trash2 className="size-4" />
                Delete Notebook
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit}>
            {isCreateMode ? "Create Notebook" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

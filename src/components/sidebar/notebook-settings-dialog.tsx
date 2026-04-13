"use client";

import { useMemo, useRef } from "react";
import { Trash2, Upload, X } from "lucide-react";
import type { NotebookFile, NotebookRecord } from "@/data/modules/notebook/schema";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { getFileIcon } from "./file-tree/file-tree-utils";

export type CreateNotebookOptions = {
  openAfterCreate: boolean;
  createStarterFile: boolean;
};

export type NotebookImportPreview = {
  sourceFileName: string;
  notebook: NotebookRecord;
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
  importPending: boolean;
  importPreview: NotebookImportPreview | null;
  onCreateOptionsChange: (options: CreateNotebookOptions) => void;
  onClearImport: () => void;
  onImportFileSelect: (file: File) => void | Promise<void>;
};

type Props = EditProps | CreateProps;

function sortNotebookFiles(files: NotebookFile[]) {
  return [...files].sort((first, second) => {
    if (first.order !== second.order) return first.order - second.order;
    if (first.type === "folder" && second.type !== "folder") return -1;
    if (first.type !== "folder" && second.type === "folder") return 1;
    return first.name.localeCompare(second.name);
  });
}

function countDirectChildren(files: NotebookFile[], parentId: string) {
  return files.filter((file) => file.parentId === parentId).length;
}

export function NotebookSettingsDialog(props: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const {
    mode,
    open,
    draftName,
    onDraftNameChange,
    onOpenChange,
    onSubmit,
  } = props;
  const isCreateMode = mode === "create";
  const importPreview = isCreateMode ? props.importPreview : null;
  const previewColumns = useMemo(() => {
    if (!importPreview) return [];

    const rootFiles = sortNotebookFiles(
      importPreview.notebook.files.filter(
        (file) => file.parentId === importPreview.notebook.id,
      ),
    );

    return [
      {
        id: importPreview.notebook.id,
        title: "Notebook root",
        items: rootFiles,
        emptyLabel: "No root files",
      },
      ...rootFiles
        .filter((file) => file.type === "folder")
        .map((folder) => ({
          id: folder.id,
          title: folder.name,
          items: sortNotebookFiles(
            importPreview.notebook.files.filter(
              (file) => file.parentId === folder.id,
            ),
          ),
          emptyLabel: "Folder is empty",
        })),
    ];
  }, [importPreview]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {isCreateMode ? "Create Notebook" : "Notebook Settings"}
          </DialogTitle>
          <DialogDescription>
            {isCreateMode
              ? "Choose a notebook name, create a starter notebook, or import a full notebook JSON."
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
            <>
              <div className="space-y-3 rounded-xl border border-sidebar-border bg-sidebar/30 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-foreground">
                      Import notebook
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Pick an exported notebook JSON to preview its structure
                      before importing.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {importPreview ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={props.onClearImport}
                      >
                        <X className="size-4" />
                        Clear
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={props.importPending}
                    >
                      <Upload className="size-4" />
                      {props.importPending
                        ? "Reading JSON..."
                        : importPreview
                          ? "Replace Import"
                          : "Import JSON"}
                    </Button>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.currentTarget.value = "";
                    if (!file) return;
                    void props.onImportFileSelect(file);
                  }}
                />

                {importPreview ? (
                  <div className="space-y-3 rounded-lg border border-sidebar-border bg-background/80 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {importPreview.sourceFileName}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {importPreview.notebook.files.length} items ready to
                          import
                        </p>
                      </div>
                      <div className="rounded-md border border-sidebar-border bg-muted px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        Columns preview
                      </div>
                    </div>

                    <ScrollArea className="max-h-72 rounded-lg border border-sidebar-border/70 bg-sidebar/20">
                      <div className="flex min-w-max gap-3 p-3">
                        {previewColumns.map((column) => (
                          <div
                            key={column.id}
                            className="flex w-56 shrink-0 flex-col rounded-lg border border-sidebar-border bg-background"
                          >
                            <div className="border-b border-sidebar-border px-3 py-2">
                              <div className="truncate text-sm font-medium text-foreground">
                                {column.title}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {column.items.length} visible at this level
                              </div>
                            </div>

                            <div className="space-y-1 p-2">
                              {column.items.length ? (
                                column.items.map((item) => {
                                  const Icon = getFileIcon(item.type);
                                  const childCount =
                                    item.type === "folder"
                                      ? countDirectChildren(
                                          importPreview.notebook.files,
                                          item.id,
                                        )
                                      : 0;

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm"
                                    >
                                      <span className="flex min-w-0 items-center gap-2">
                                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                                        <span className="truncate text-foreground">
                                          {item.name}
                                        </span>
                                      </span>
                                      {item.type === "folder" ? (
                                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                                          {childCount}
                                        </span>
                                      ) : null}
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="px-2 py-3 text-xs text-muted-foreground">
                                  {column.emptyLabel}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-sidebar-border px-3 py-4 text-sm text-muted-foreground">
                    No import selected. You can create an empty notebook or
                    load one from JSON.
                  </div>
                )}
              </div>

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

                {!importPreview ? (
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">
                        Create starter file
                      </p>
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
                ) : (
                  <div className="rounded-lg border border-sidebar-border/70 bg-background/80 px-3 py-2 text-xs text-muted-foreground">
                    Starter file is skipped for imports because the notebook JSON
                    already provides the file tree and contents.
                  </div>
                )}
              </div>
            </>
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
            {isCreateMode
              ? importPreview
                ? "Import Notebook"
                : "Create Notebook"
              : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

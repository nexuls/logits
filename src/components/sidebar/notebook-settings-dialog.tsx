"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight, Trash2, Upload, X } from "lucide-react";
import type {
  NotebookFile,
  NotebookRecord,
} from "@/data/modules/notebook/schema";
import { cn } from "@/lib/utils";
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

type NotebookPreviewTreeProps = {
  preview: NotebookImportPreview | null;
};

function NotebookPreviewTree({ preview }: NotebookPreviewTreeProps) {
  const [collapsedFolders, setCollapsedFolders] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    if (!preview) {
      setCollapsedFolders({});
      return;
    }

    const nextState: Record<string, boolean> = {};

    for (const file of preview.notebook.files) {
      if (file.type !== "folder") continue;
      nextState[file.id] = true;
    }

    setCollapsedFolders(nextState);
  }, [preview]);

  const filesByParent = useMemo(() => {
    if (!preview) return new Map<string, NotebookFile[]>();

    const mapping = new Map<string, NotebookFile[]>();

    for (const file of preview.notebook.files) {
      const current = mapping.get(file.parentId) ?? [];
      current.push(file);
      mapping.set(file.parentId, current);
    }

    return mapping;
  }, [preview]);

  const toggleFolder = (fileId: string) => {
    setCollapsedFolders((current) => ({
      ...current,
      [fileId]: !current[fileId],
    }));
  };

  const renderBranch = (parentId: string, depth = 0): ReactNode => {
    const children = sortNotebookFiles(filesByParent.get(parentId) ?? []);
    if (!children.length) return null;

    return (
      <div className="space-y-0.5">
        {children.map((file) => {
          const isFolder = file.type === "folder";
          const isCollapsed = collapsedFolders[file.id] ?? true;
          const Icon = getFileIcon(file.type);
          const childIndentGuideLeft = depth * 14 + 18;

          return (
            <div key={file.id}>
              <button
                type="button"
                onClick={() => {
                  if (isFolder) toggleFolder(file.id);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-sidebar-accent/50 hover:transition-none",
                  !isFolder && "cursor-default",
                )}
                style={{ paddingLeft: `${depth * 14 + 8}px` }}
              >
                <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                  {isFolder ? (
                    <ChevronRight
                      className={cn(
                        "size-4 transition-transform",
                        !isCollapsed && "rotate-90",
                      )}
                    />
                  ) : null}
                </span>

                <Icon className="size-4 shrink-0 text-muted-foreground" />

                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {file.name}
                </span>

                {isFolder ? (
                  <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                    {countDirectChildren(
                      preview?.notebook.files ?? [],
                      file.id,
                    )}
                  </span>
                ) : null}
              </button>

              {isFolder && !isCollapsed ? (
                <div className="relative">
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute top-0 bottom-0 border-l border-sidebar-border/70"
                    style={{ left: `${childIndentGuideLeft}px` }}
                  />
                  {renderBranch(file.id, depth + 1)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  if (!preview) {
    return null;
  }

  return (
    <div className="flex min-h-72 h-full flex-col rounded-xl border border-sidebar-border bg-background">
      <div className="border-b border-sidebar-border px-4 py-3">
        <div className="text-sm font-medium text-foreground">File tree</div>
        <div className="text-xs text-muted-foreground">
          Preview of the imported notebook structure
        </div>
      </div>

      <ScrollArea className="min-h-0 h-full flex-1 [&>div>div]:block!">
        <div className="p-3">{renderBranch(preview.notebook.id)}</div>
      </ScrollArea>
    </div>
  );
}

export function NotebookSettingsDialog(props: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { mode, open, draftName, onDraftNameChange, onOpenChange, onSubmit } =
    props;
  const isCreateMode = mode === "create";
  const importPreview = isCreateMode ? props.importPreview : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "h-[80vh] w-[calc(100%-2rem)] flex flex-col overflow-hidden",
          {
            "sm:max-w-5xl": importPreview,
            "sm:max-w-3xl": !importPreview,
          },
        )}
      >
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

        <div className="min-h-0 h-full flex-1 overflow-hidden">
          {isCreateMode ? (
            <div
              className={cn(
                "grid h-full min-h-0 gap-4",
                importPreview
                  ? "md:grid-cols-[minmax(0,6.5fr)_minmax(0,3.5fr)]"
                  : "grid-cols-1",
              )}
            >
              <ScrollArea className="min-h-0 rounded-xl border border-sidebar-border bg-sidebar/30">
                <div className="space-y-4 p-4">
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
                      onChange={(event) =>
                        onDraftNameChange(event.target.value)
                      }
                      placeholder="Enter notebook name"
                    />
                  </div>

                  <div className="space-y-3 rounded-xl border border-sidebar-border bg-background/80 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-medium text-foreground">
                          Import notebook
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Choose a notebook JSON and inspect the file tree
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

                    <div className="rounded-lg border border-sidebar-border/70 bg-sidebar/20 px-3 py-2">
                      {importPreview ? (
                        <>
                          <p className="truncate text-sm font-medium text-foreground">
                            {importPreview.sourceFileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {importPreview.notebook.files.length} items ready to
                            import
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-foreground">
                            No import selected
                          </p>
                          <p className="text-xs text-muted-foreground">
                            You can still create an empty notebook from this
                            dialog.
                          </p>
                        </>
                      )}
                    </div>

                    <div className="md:hidden">
                      <NotebookPreviewTree preview={importPreview} />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-sidebar-border bg-background/80 p-3">
                    <div className="text-sm font-medium text-foreground">
                      Notebook options
                    </div>

                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm text-foreground">
                          Open after create
                        </p>
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
                      <div className="rounded-lg border border-sidebar-border/70 bg-sidebar/20 px-3 py-2 text-xs text-muted-foreground">
                        Starter file is skipped for imports because the selected
                        JSON already includes the notebook structure and file
                        contents.
                      </div>
                    )}
                  </div>
                </div>
              </ScrollArea>

              {importPreview ? (
                <div className="hidden min-h-0 h-full md:block">
                  <NotebookPreviewTree preview={importPreview} />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <label
                htmlFor="notebook-name"
                className="text-sm font-medium text-foreground"
              >
                Rename notebook
              </label>
              <Input
                id="notebook-name"
                value={draftName}
                onChange={(event) => onDraftNameChange(event.target.value)}
                placeholder="Enter notebook name"
              />

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

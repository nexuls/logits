import { useState, type ComponentType, type ReactNode } from "react";
import {
  CopyPlus,
  Download,
  EllipsisVertical,
  FileDown,
  FolderPlus,
  Link2,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import type { AppFile } from "@/data/modules/notebook/client-types";
import {
  FileTreeContextActionMenu,
  FileTreeDropdownActionMenu,
} from "./actions-menus";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type MenuItemComponent = ComponentType<{
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}>;

type MenuSeparatorComponent = ComponentType<Record<string, never>>;

type Props = {
  file: AppFile;
  Item: MenuItemComponent;
  Separator: MenuSeparatorComponent;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: AppFile) => void;
  onRename: (file: AppFile) => void;
  onDuplicate: (file: AppFile) => void;
  onDelete: (file: AppFile) => void;
  onConvertToPdf: (file: AppFile) => void;
};

export function FileTreeActionItems({
  file,
  Item,
  Separator,
  onCreate,
  onCopyLink,
  onRename,
  onDuplicate,
  onDelete,
  onConvertToPdf,
}: Props) {
  const isFolder = file.metadata.type === "folder";
  const isTextFile = file.metadata.type === "file";

  return (
    <>
      {isFolder ? (
        <>
          <Item onSelect={() => onCreate(file.id, "file")}>
            <Plus className="size-4" />
            New note
          </Item>
          <Item onSelect={() => onCreate(file.id, "folder")}>
            <FolderPlus className="size-4" />
            New folder
          </Item>
          <Separator />
        </>
      ) : null}

      <Item onSelect={() => onCopyLink(file)}>
        <Link2 className="size-4" />
        Copy link
      </Item>
      <Item onSelect={() => onRename(file)}>
        <Pencil className="size-4" />
        Rename
      </Item>
      <Item onSelect={() => onDuplicate(file)}>
        <CopyPlus className="size-4" />
        Duplicate
      </Item>
      {isTextFile ? (
        <Item onSelect={() => onConvertToPdf(file)}>
          <FileDown className="size-4" />
          Convert to PDF
        </Item>
      ) : null}
      <Item disabled>
        <Download className="size-4" />
        Download
      </Item>
      <Item disabled>
        <Pin className="size-4" />
        Pin file
      </Item>
      <Separator />
      <Item variant="destructive" onSelect={() => onDelete(file)}>
        <Trash2 className="size-4" />
        Delete
      </Item>
    </>
  );
}

type DeleteConfirmDialogProps = {
  file: AppFile | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmDelete: (file: AppFile) => void;
};

function DeleteConfirmDialog({
  file,
  open,
  onOpenChange,
  onConfirmDelete,
}: DeleteConfirmDialogProps) {
  const fileLabel = file?.metadata.type === "folder" ? "folder" : "note";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {fileLabel}?</DialogTitle>
          <DialogDescription>
            This will permanently delete {file?.name ?? "this item"}. This
            action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (!file) return;
              onConfirmDelete(file);
              onOpenChange(false);
            }}
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type SharedProps = {
  file: AppFile;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: AppFile) => void;
  onRename: (file: AppFile) => void;
  onDuplicate: (file: AppFile) => void;
  onDelete: (file: AppFile) => void;
  onConvertToPdf: (file: AppFile) => void;
};

type ContextProps = SharedProps & {
  children: ReactNode;
};

export function FileTreeItemContextMenu({ children, ...props }: ContextProps) {
  const [fileToDelete, setFileToDelete] = useState<AppFile | null>(null);

  return (
    <>
      <FileTreeContextActionMenu
        renderActions={({ Item, Separator }) => (
          <FileTreeActionItems
            {...props}
            Item={Item}
            Separator={Separator}
            onDelete={(file) => setFileToDelete(file)}
          />
        )}
      >
        {children}
      </FileTreeContextActionMenu>

      <DeleteConfirmDialog
        file={fileToDelete}
        open={fileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFileToDelete(null);
          }
        }}
        onConfirmDelete={props.onDelete}
      />
    </>
  );
}

export function FileTreeItemActions(props: SharedProps) {
  const [fileToDelete, setFileToDelete] = useState<AppFile | null>(null);

  return (
    <>
      <FileTreeDropdownActionMenu
        ariaLabel={`${props.file.name} actions`}
        trigger={<EllipsisVertical className="size-4" />}
        buttonClassName="size-7 shrink-0 rounded-md text-muted-foreground md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sidebar-accent hover:text-foreground"
        renderActions={({ Item, Separator }) => (
          <FileTreeActionItems
            {...props}
            Item={Item}
            Separator={Separator}
            onDelete={(file) => setFileToDelete(file)}
          />
        )}
      />

      <DeleteConfirmDialog
        file={fileToDelete}
        open={fileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setFileToDelete(null);
          }
        }}
        onConfirmDelete={props.onDelete}
      />
    </>
  );
}

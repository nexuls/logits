import type { ComponentType, ReactNode } from "react";
import {
  CopyPlus,
  Download,
  EllipsisVertical,
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
}: Props) {
  const isFolder = file.metadata.type === "folder";

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

type SharedProps = {
  file: AppFile;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: AppFile) => void;
  onRename: (file: AppFile) => void;
  onDuplicate: (file: AppFile) => void;
  onDelete: (file: AppFile) => void;
};

type ContextProps = SharedProps & {
  children: ReactNode;
};

export function FileTreeItemContextMenu({ children, ...props }: ContextProps) {
  return (
    <FileTreeContextActionMenu
      renderActions={({ Item, Separator }) => (
        <FileTreeActionItems {...props} Item={Item} Separator={Separator} />
      )}
    >
      {children}
    </FileTreeContextActionMenu>
  );
}

export function FileTreeItemActions(props: SharedProps) {
  return (
    <FileTreeDropdownActionMenu
      ariaLabel={`${props.file.name} actions`}
      trigger={<EllipsisVertical className="size-4" />}
      buttonClassName="size-7 shrink-0 rounded-md text-muted-foreground md:opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-sidebar-accent hover:text-foreground"
      renderActions={({ Item, Separator }) => (
        <FileTreeActionItems {...props} Item={Item} Separator={Separator} />
      )}
    />
  );
}

import type { ComponentType, ReactNode } from "react";
import {
  CopyPlus,
  Download,
  FolderPlus,
  Link2,
  Pencil,
  Pin,
  Plus,
  Trash2,
} from "lucide-react";
import type { T_File } from "@/types/types";

type MenuItemComponent = ComponentType<{
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  variant?: "default" | "destructive";
}>;

type MenuSeparatorComponent = ComponentType<Record<string, never>>;

type Props = {
  file: T_File;
  Item: MenuItemComponent;
  Separator: MenuSeparatorComponent;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onCopyLink: (file: T_File) => void;
  onRename: (file: T_File) => void;
  onDuplicate: (file: T_File) => void;
  onDelete: (file: T_File) => void;
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
          <Item
            onSelect={() => {
              onCreate(file.id, "file");
            }}
          >
            <Plus className="size-4" />
            New note
          </Item>
          <Item
            onSelect={() => {
              onCreate(file.id, "folder");
            }}
          >
            <FolderPlus className="size-4" />
            New folder
          </Item>
          <Separator />
        </>
      ) : null}

      <Item
        onSelect={() => {
          onCopyLink(file);
        }}
      >
        <Link2 className="size-4" />
        Copy link
      </Item>
      <Item
        onSelect={() => {
          onRename(file);
        }}
      >
        <Pencil className="size-4" />
        Rename
      </Item>
      <Item
        onSelect={() => {
          onDuplicate(file);
        }}
      >
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
      <Item
        variant="destructive"
        onSelect={() => {
          onDelete(file);
        }}
      >
        <Trash2 className="size-4" />
        Delete
      </Item>
    </>
  );
}

import {
  EllipsisIcon,
  FolderPlus,
  Plus,
  Settings2,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  FileTreeContextActionMenu,
  FileTreeDropdownActionMenu,
  type MenuItemComponent,
  type MenuSeparatorComponent,
} from "./actions-menus";

type SharedProps = {
  notebookId: string;
  hasActiveNotebook: boolean;
  onCreate: (parentId: string, type: "file" | "folder") => void;
  onOpenNotebookSettings: () => void;
};

type ContextProps = SharedProps & {
  children: ReactNode;
};

type ActionItemsProps = SharedProps & {
  Item: MenuItemComponent;
  Separator: MenuSeparatorComponent;
};

function FileTreeNotebookActionItems({
  notebookId,
  hasActiveNotebook,
  onCreate,
  onOpenNotebookSettings,
  Item,
  Separator,
}: ActionItemsProps) {
  return (
    <>
      <Item onSelect={() => onCreate(notebookId, "file")}>
        <Plus className="size-4" />
        Create new file
      </Item>
      <Item onSelect={() => onCreate(notebookId, "folder")}>
        <FolderPlus className="size-4" />
        Create new folder
      </Item>
      <Separator />
      <Item disabled={!hasActiveNotebook} onSelect={onOpenNotebookSettings}>
        <Settings2 className="size-4" />
        Notebook settings
      </Item>
    </>
  );
}

export function FileTreeActionsContextMenu({ children, ...props }: ContextProps) {
  return (
    <FileTreeContextActionMenu
      contentClassName="w-52"
      renderActions={({ Item, Separator }) => (
        <FileTreeNotebookActionItems
          {...props}
          Item={Item}
          Separator={Separator}
        />
      )}
    >
      {children}
    </FileTreeContextActionMenu>
  );
}

export function FileTreeActions(props: SharedProps) {
  return (
    <FileTreeDropdownActionMenu
      ariaLabel="Notebook actions"
      trigger={<EllipsisIcon className="size-4" />}
      buttonVariant="outline"
      buttonSize="sm"
      buttonClassName="h-9 rounded-lg"
      contentClassName="w-52"
      stopPropagation={false}
      renderActions={({ Item, Separator }) => (
        <FileTreeNotebookActionItems
          {...props}
          Item={Item}
          Separator={Separator}
        />
      )}
    />
  );
}

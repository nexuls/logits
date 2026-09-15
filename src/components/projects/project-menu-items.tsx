"use client";

import {
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  Trash2Icon,
} from "lucide-react";

import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "@/components/ui/context-menu";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";

/**
 * The parts are styled per menu and each has to sit under its own root, so
 * the same list is rendered from whichever set matches the menu it is in.
 */
const PARTS = {
  dropdown: {
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Shortcut: DropdownMenuShortcut,
  },
  context: {
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Shortcut: ContextMenuShortcut,
  },
} as const;

type Props = {
  menu: keyof typeof PARTS;
  pinned: boolean;
  onRename: () => void;
  onTogglePin: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  /** Copies the project's embeddable `/preview` link. */
  onCopyLink: () => void;
  onRequestDelete: () => void;
};

/** A sidebar project's actions, identical from its ⋯ button and a right-click. */
export default function ProjectMenuItems({
  menu,
  pinned,
  onRename,
  onTogglePin,
  onDuplicate,
  onExport,
  onCopyLink,
  onRequestDelete,
}: Props) {
  const { Item, Separator, Shortcut } = PARTS[menu];

  return (
    <>
      <Item onClick={onRename}>
        <PencilIcon />
        Rename
        <Shortcut>F2</Shortcut>
      </Item>
      <Item onClick={onDuplicate}>
        <CopyIcon />
        Duplicate
      </Item>
      <Item onClick={onTogglePin}>
        {pinned ? <PinOffIcon /> : <PinIcon />}
        {pinned ? "Unpin" : "Pin"}
      </Item>
      <Separator />
      <Item onClick={onExport}>
        <DownloadIcon />
        Export as JSON
      </Item>
      <Item onClick={onCopyLink}>
        <LinkIcon />
        Copy link
      </Item>
      <Separator />
      <Item variant="destructive" onClick={onRequestDelete}>
        <Trash2Icon />
        Delete
        <Shortcut>Del</Shortcut>
      </Item>
    </>
  );
}

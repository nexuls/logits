"use client";

import {
  ArrowUpDownIcon,
  CircuitBoardIcon,
  CopyIcon,
  DownloadIcon,
  KeyboardIcon,
  LinkIcon,
  LocateFixedIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  SettingsIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SettingsSection } from "./settings-dialog";

type Props = {
  /** No circuit is open: everything that acts on one is disabled. */
  hasDocument: boolean;
  /** An example is open — it can be copied into the projects, never deleted. */
  ephemeral: boolean;
  onNewProject: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onSetViewAsOrigin: () => void;
  onImport: () => void;
  onExport: () => void;
  /** Copies the embeddable `/preview` link — the same as the Share button. */
  onCopyLink: () => void;
  onOpenSettings: (section: SettingsSection) => void;
  onOpenShortcuts: () => void;
  onDelete: () => void;
};

/** The canvas header's menu: the open project, files, and editor settings. */
export default function ProjectMenu({
  hasDocument,
  ephemeral,
  onNewProject,
  onRename,
  onDuplicate,
  onSetViewAsOrigin,
  onImport,
  onExport,
  onCopyLink,
  onOpenSettings,
  onOpenShortcuts,
  onDelete,
}: Props) {
  // New and Rename put focus in the title editor. The menu would hand focus
  // back to its trigger as it closes, which blurs that editor — and a blur
  // commits the rename before a key is typed. Those two opt out of the return.
  const keepFocus = useRef(false);
  const intoTitle = (action: () => void) => () => {
    keepFocus.current = true;
    action();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            aria-label="Project menu"
          >
            <MoreHorizontalIcon />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        className="min-w-56"
        finalFocus={() => {
          const restore = !keepFocus.current;
          keepFocus.current = false;
          return restore;
        }}
      >
        <DropdownMenuItem onClick={intoTitle(onNewProject)}>
          <PlusIcon />
          New project
        </DropdownMenuItem>
        <DropdownMenuItem onClick={intoTitle(onRename)} disabled={!hasDocument}>
          <PencilIcon />
          Rename
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate} disabled={!hasDocument}>
          <CopyIcon />
          {ephemeral ? "Save to projects" : "Duplicate"}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onSetViewAsOrigin} disabled={!hasDocument}>
          <LocateFixedIcon />
          Set view as origin
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ArrowUpDownIcon />
            Import / Export
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            <DropdownMenuItem onClick={onImport}>
              <UploadIcon />
              Import circuit file…
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onExport} disabled={!hasDocument}>
              <DownloadIcon />
              Export as JSON
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={onCopyLink} disabled={!hasDocument}>
          <LinkIcon />
          Copy link
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SettingsIcon />
            Settings
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            <DropdownMenuItem onClick={() => onOpenSettings("preferences")}>
              <SlidersHorizontalIcon />
              Preferences…
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onOpenSettings("project")}
              disabled={!hasDocument}
            >
              <CircuitBoardIcon />
              Project settings…
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem onClick={onOpenShortcuts}>
          <KeyboardIcon />
          Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={onDelete}
          disabled={!hasDocument || ephemeral}
        >
          <Trash2Icon />
          Delete project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

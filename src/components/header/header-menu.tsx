"use client";

import { EllipsisVertical } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

type Props = {
  canRenameFile?: boolean;
  onRenameNotebookRequest?: () => void;
  onRenameCurrentFileRequest?: () => void;
};

export default function HeaderMenu({
  canRenameFile = false,
  onRenameNotebookRequest,
  onRenameCurrentFileRequest,
}: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open menu">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={() => onRenameNotebookRequest?.()}>
          Rename notebook
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!canRenameFile}
          onSelect={() => onRenameCurrentFileRequest?.()}
        >
          Rename current file
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>Download notebook</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

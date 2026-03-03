"use client";

import { useState } from "react";
import { EllipsisVertical } from "lucide-react";

import { Button } from "../ui/button";
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
} from "../ui/dropdown-menu";

type Props = {
  onRenameProjectRequest?: () => void;
  onRenameCurrentPageRequest?: () => void;
};

export default function HeaderMenu({
  onRenameProjectRequest,
  onRenameCurrentPageRequest,
}: Props) {
  const [language, setLanguage] = useState("English");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Open menu">
          <EllipsisVertical />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Edit</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem>
              Undo
              <DropdownMenuShortcut>Ctrl+Z</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Redo
              <DropdownMenuShortcut>Ctrl+Y</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onRenameProjectRequest?.()}>
              Rename Project
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRenameCurrentPageRequest?.()}>
              Rename Current Page
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>View</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem>
              Zoom In
              <DropdownMenuShortcut>Ctrl++</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Zoom Out
              <DropdownMenuShortcut>Ctrl+-</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Reset Zoom
              <DropdownMenuShortcut>Ctrl+0</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuItem>Export as PNG</DropdownMenuItem>
            <DropdownMenuItem>Export as PDF</DropdownMenuItem>
            <DropdownMenuItem>Export as JSON</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuItem>
          Download
          <DropdownMenuShortcut>Ctrl+D</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Preferences</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuItem>Appearance</DropdownMenuItem>
            <DropdownMenuItem>Canvas</DropdownMenuItem>
            <DropdownMenuItem>Autosave</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Language</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {[
              "English",
              "Spanish",
              "French",
              "German",
            ].map((item) => (
              <DropdownMenuItem key={item} onSelect={() => setLanguage(item)}>
                <span>{item}</span>
                <DropdownMenuShortcut>
                  {language === item ? "Current" : ""}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Keyboard Shortcuts</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuItem>
              Search Actions
              <DropdownMenuShortcut>Ctrl+K</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Command Palette
              <DropdownMenuShortcut>Ctrl+Shift+P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem>
              Toggle Sidebar
              <DropdownMenuShortcut>Ctrl+B</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

"use client";

import { ChevronDown, Ellipsis, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Props = object;

function PreviewMenu(_: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="gap-1.5">
          <Eye className="size-3.5" />
          Preview
          <ChevronDown className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuItem>Open split view</DropdownMenuItem>
        <DropdownMenuItem>Open in new tab</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function NotebookActions(_: Props) {
  return (
    <div className="ml-3 flex shrink-0 items-center gap-1.5">
      <PreviewMenu />
      <Button variant="ghost" size="xs" disabled>
        Action 1
      </Button>
      <Button variant="ghost" size="icon-xs" disabled aria-label="More actions">
        <Ellipsis className="size-3.5" />
      </Button>
    </div>
  );
}

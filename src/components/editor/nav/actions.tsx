"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Ellipsis, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buildNotebookUrl } from "@/lib/notebook-url";

type Props = {
  notebookId: string;
  activeFileId?: string;
};

export function NotebookActions(props: Props) {
  return (
    <div className="ml-3 flex shrink-0 items-center gap-1.5">
      <EditorMenu {...props} />
    </div>
  );
}

function EditorMenu({ notebookId, activeFileId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const openPreviewInTabView = () => {
    if (!activeFileId) return;

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("preview", "1");

    router.push(
      buildNotebookUrl(notebookId, {
        fileId: activeFileId,
        searchParams: nextParams,
      }),
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs" aria-label="More actions">
          <Ellipsis className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Eye className="size-4" />
            Preview
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              disabled={!activeFileId}
              onSelect={openPreviewInTabView}
            >
              Open in tab view
            </DropdownMenuItem>
            <DropdownMenuItem>Open in split view</DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

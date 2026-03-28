"use client";

import { BookOpenText, ChevronDown, PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useNotebooks } from "@/hooks/use-notebooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarHeader } from "@/components/ui/sidebar";

type Props = {
  activeNotebookId?: string;
};

export function AppSidebarHeader({ activeNotebookId }: Props) {
  const router = useRouter();
  const { notebooks, createNotebook } = useNotebooks();
  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ??
    notebooks[0] ??
    null;

  const onCreateNotebook = async () => {
    const createdNotebook = await createNotebook();

    if (createdNotebook) {
      router.push(`/p/${createdNotebook.id}`);
    }
  };

  return (
    <SidebarHeader className="px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="min-w-0 flex-1 justify-between overflow-hidden"
            >
              <span className="flex min-w-0 items-center gap-2">
                <BookOpenText className="size-4 shrink-0" />
                <span className="truncate">
                  {activeNotebook?.name ?? "Select notebook"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            {notebooks.map((notebook) => (
              <DropdownMenuItem
                key={notebook.id}
                onSelect={() => {
                  router.push(`/p/${notebook.id}`);
                }}
              >
                {notebook.name}
              </DropdownMenuItem>
            ))}
            {!notebooks.length ? (
              <DropdownMenuItem disabled>No notebooks yet</DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          onClick={() => {
            void onCreateNotebook();
          }}
          aria-label="Create notebook"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
    </SidebarHeader>
  );
}

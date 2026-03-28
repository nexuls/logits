"use client";

import {
  ChevronDown,
  NotebookIcon,
  PlusIcon,
  Search,
  Settings2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useNotebooks } from "@/hooks/use-notebooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { SidebarHeader } from "@/components/ui/sidebar";
import { NotebookSettingsDialog } from "./notebook-settings-dialog";

type Props = {
  activeNotebookId?: string;
};

type NotebookSettingsState = {
  id: string;
  name: string;
} | null;

export function AppSidebarHeader({ activeNotebookId }: Props) {
  const router = useRouter();
  const { notebooks, createNotebook, renameNotebook, deleteNotebook } =
    useNotebooks();
  const [query, setQuery] = useState("");
  const [settingsNotebook, setSettingsNotebook] =
    useState<NotebookSettingsState>(null);
  const [draftName, setDraftName] = useState("");

  const activeNotebook =
    notebooks.find((notebook) => notebook.id === activeNotebookId) ??
    notebooks[0] ??
    null;

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNotebooks = normalizedQuery
    ? notebooks.filter((notebook) =>
        notebook.name.toLowerCase().includes(normalizedQuery),
      )
    : notebooks;

  useEffect(() => {
    if (settingsNotebook) {
      setDraftName(settingsNotebook.name);
    }
  }, [settingsNotebook]);

  const onCreateNotebook = async () => {
    const createdNotebook = await createNotebook();

    if (createdNotebook) {
      setQuery("");
      router.push(`/p/${createdNotebook.id}`);
    }
  };

  const onRenameNotebook = async () => {
    if (!settingsNotebook) {
      return;
    }

    const nextName = draftName.trim();

    if (!nextName || nextName === settingsNotebook.name) {
      setSettingsNotebook(null);
      return;
    }

    await renameNotebook(settingsNotebook.id, nextName);
    setSettingsNotebook(null);
  };

  const onDeleteNotebook = async () => {
    if (!settingsNotebook) {
      return;
    }

    const fallbackNotebook = await deleteNotebook(settingsNotebook.id);
    setSettingsNotebook(null);

    if (activeNotebook?.id === settingsNotebook.id) {
      if (fallbackNotebook) {
        router.push(`/p/${fallbackNotebook.id}`);
      } else {
        router.push("/");
      }
    }
  };

  return (
    <>
      <SidebarHeader className="px-3 pt-3 pb-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-11 w-full justify-between rounded-lg border-sidebar-border bg-sidebar/60 px-3 shadow-xs hover:bg-sidebar-accent/50"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <NotebookIcon className="ml-2 size-5 text-muted-foreground" />
                <span className="truncate text-sm font-semibold">
                  {activeNotebook?.name ?? "Select notebook"}
                </span>
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-88 rounded-2xl border-sidebar-border bg-popover p-0 shadow-2xl"
          >
            <div className="relative p-2">
              <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search notebooks..."
                className="h-10 rounded-xl border-sidebar-border bg-background pl-9 pr-14"
              />
              <span className="pointer-events-none absolute top-1/2 right-5 -translate-y-1/2 rounded-md border border-sidebar-border bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Esc
              </span>
            </div>

            <div className="px-2 pb-2">
              {filteredNotebooks.length ? (
                filteredNotebooks.map((notebook) => {
                  const isActive = notebook.id === activeNotebook?.id;

                  return (
                    <DropdownMenuItem
                      key={notebook.id}
                      onSelect={() => {
                        setQuery("");
                        router.push(`/p/${notebook.id}`);
                      }}
                      className="flex min-h-10 items-center gap-0 rounded-lg px-2 py-0 focus:bg-accent"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-2.5">
                        <NotebookIcon className="ml-2 size-4 text-muted-foreground" />
                        <span className="truncate font-medium">
                          {notebook.name}
                          {isActive ? " (Current)" : ""}
                        </span>
                      </span>

                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        className="shrink-0 rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                        aria-label={`Notebook settings for ${notebook.name}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSettingsNotebook({
                            id: notebook.id,
                            name: notebook.name,
                          });
                        }}
                      >
                        <Settings2 className="size-4" />
                      </Button>
                    </DropdownMenuItem>
                  );
                })
              ) : (
                <div className="px-3 py-6 text-sm text-muted-foreground">
                  No notebooks found.
                </div>
              )}
            </div>

            <DropdownMenuSeparator className="mx-0 my-0" />

            <DropdownMenuItem
              onSelect={() => {
                void onCreateNotebook();
              }}
              className="min-h-15 rounded-none px-2 py-1 focus:bg-accent"
            >
              <PlusIcon className="mx-2 size-6 text-muted-foreground" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold text-foreground">
                  Create Notebook
                </span>
                <span className="text-xs text-muted-foreground">
                  Add a new notebook to your workspace
                </span>
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarHeader>

      <NotebookSettingsDialog
        open={settingsNotebook !== null}
        notebookName={settingsNotebook?.name ?? "this notebook"}
        draftName={draftName}
        deleteDisabled={notebooks.length <= 1}
        onDraftNameChange={setDraftName}
        onOpenChange={(open) => {
          if (!open) {
            setSettingsNotebook(null);
          }
        }}
        onDelete={() => {
          void onDeleteNotebook();
        }}
        onSave={() => {
          void onRenameNotebook();
        }}
      />
    </>
  );
}

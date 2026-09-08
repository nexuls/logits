"use client";

import { CircuitBoardIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useMemo, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Kbd } from "@/components/ui/kbd";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getExample } from "@/example";
import type { ProjectMeta } from "@/lib/circuit/schema";
import { getDocument } from "@/state/document";
import {
  createProject,
  createProjectFrom,
  deleteProject,
  pinProject,
  renameProject,
  useHydrated,
  useProjects,
} from "@/state/projects-store";
import ExamplesGroup from "./examples-group";
import ProjectItem from "./project-item";

type Props = {
  activeProjectId?: string;
  onSelectProject?: (projectId: string) => void;
};

export default function ProjectsSidebar({
  activeProjectId,
  onSelectProject,
}: Props) {
  const projects = useProjects();
  const hydrated = useHydrated();

  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ProjectMeta | null>(null);
  // Storage can refuse a write — a full quota, or a browser blocking it. The
  // list would then silently not change, so the reason has to be visible.
  const [error, setError] = useState<string | null>(null);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return projects;

    return projects.filter((project) =>
      project.name.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  const pinned = matches.filter((project) => project.pinned);
  const rest = matches.filter((project) => !project.pinned);

  const report = (result: { ok: boolean; error?: string }) => {
    setError(result.ok ? null : (result.error ?? "Could not save"));
  };

  const create = () => {
    const result = createProject();
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setQuery("");
    onSelectProject?.(result.id);
    // Straight into a rename: a new circuit's name is the first thing you want
    // to change, and it saves a trip to the menu.
    setEditingId(result.id);
  };

  /**
   * Turns an example into a project the user owns.
   *
   * It imports what is *on screen* when that example is the open document, not
   * the pristine file: an example is editable, so the button would otherwise
   * silently discard the very edits it is being asked to keep.
   */
  const importExample = (exampleId: string) => {
    const example = getExample(exampleId);
    if (!example) return;

    const open = getDocument();
    const result = createProjectFrom(
      open?.id === exampleId ? open : example.document,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setQuery("");
    onSelectProject?.(result.id);
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;

    report(deleteProject(pendingDelete.id));
    if (pendingDelete.id === activeProjectId) {
      const next = projects.find((project) => project.id !== pendingDelete.id);
      onSelectProject?.(next?.id ?? "");
    }
    setPendingDelete(null);
  };

  const renderGroup = (label: string, items: ProjectMeta[]) => {
    if (items.length === 0) return null;

    return (
      <SidebarGroup>
        <SidebarGroupLabel>{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {items.map((project) => (
              <ProjectItem
                key={project.id}
                project={project}
                isActive={project.id === activeProjectId}
                isEditing={project.id === editingId}
                onSelect={() => onSelectProject?.(project.id)}
                onEditingChange={(editing) =>
                  setEditingId(editing ? project.id : null)
                }
                onRename={(name) => report(renameProject(project.id, name))}
                onTogglePin={() =>
                  report(pinProject(project.id, !project.pinned))
                }
                onRequestDelete={() => setPendingDelete(project)}
              />
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    );
  };

  return (
    <Sidebar side="left" collapsible="offcanvas">
      <SidebarHeader className="gap-3">
        <div className="flex items-center gap-2 px-1">
          <span className="text-sm font-semibold">Projects</span>
        </div>

        <div className="relative">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <SidebarInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search projects"
            aria-label="Search projects"
            className="pl-8"
          />
        </div>
      </SidebarHeader>

      <SidebarSeparator className="mx-0" />

      <SidebarContent>
        {/* Nothing is readable until the client has storage, so the first paint
            shows placeholders rather than flashing "no projects yet". */}
        {!hydrated && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Fixed widths, not `SidebarMenuSkeleton`: that one picks a
                    random width, which differs between the server and client
                    renders and trips a hydration mismatch. */}
                {[70, 55, 62].map((width) => (
                  <SidebarMenuItem key={width}>
                    <div className="flex h-12 items-center gap-2 px-3">
                      <Skeleton className="size-4 rounded-xl" />
                      <div className="flex flex-1 flex-col gap-1.5">
                        <Skeleton
                          className="h-3.5"
                          style={{ width: `${width}%` }}
                        />
                        <Skeleton className="h-3 w-2/5" />
                      </div>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {hydrated && renderGroup("Pinned", pinned)}
        {hydrated && renderGroup("All projects", rest)}

        {hydrated && projects.length === 0 && (
          <Empty className="px-4">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CircuitBoardIcon />
              </EmptyMedia>
              <EmptyTitle>No circuits yet</EmptyTitle>
              <EmptyDescription>
                Create one to start placing gates.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        {hydrated && projects.length > 0 && matches.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            No projects match “{query.trim()}”.
          </p>
        )}

        {/* Not gated on `hydrated`: the examples are compiled in rather than
            read from storage, so they are the same on the server and the
            client and can fill the first paint. */}
        <ExamplesGroup
          activeId={activeProjectId}
          onOpen={(exampleId) => onSelectProject?.(exampleId)}
          onImport={importExample}
        />
      </SidebarContent>

      <SidebarFooter>
        {error && (
          <p role="alert" className="px-1 text-xs text-destructive">
            {error}
          </p>
        )}
        <Button
          variant="outline"
          className="w-full justify-start"
          onClick={create}
        >
          <PlusIcon />
          New project
        </Button>
        <p className="px-1 text-center text-xs text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
          <Kbd>⌘B</Kbd> to toggle
        </p>
      </SidebarFooter>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the circuit from this browser. It cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sidebar>
  );
}

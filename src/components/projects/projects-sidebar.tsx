"use client";

import {
  CircuitBoardIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  type CreateResult,
  createProject,
  createProjectFrom,
  pinProject,
  renameProject,
  useHydrated,
  useProjects,
} from "@/state/projects-store";
import type { StorageResult } from "@/state/storage";
import DeleteProjectDialog from "./delete-project-dialog";
import ExamplesGroup from "./examples-group";
import GithubStarBanner from "./github-star-banner";
import {
  duplicateProject,
  exportProject,
  importCircuitFile,
} from "./project-actions";
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

  /** Where a create, copy or import lands: the new project, opened. */
  const openCreated = (result: CreateResult) => {
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setError(null);
    setQuery("");
    onSelectProject?.(result.id);
  };

  const importFile = () =>
    importCircuitFile((result) =>
      openCreated(result.ok ? result : { ok: false, error: result.message }),
    );

  const onDeleted = (result: StorageResult, projectId: string) => {
    report(result);
    if (projectId === activeProjectId) {
      const next = projects.find((project) => project.id !== projectId);
      onSelectProject?.(next?.id ?? "");
    }
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
                onDuplicate={() => openCreated(duplicateProject(project.id))}
                onExport={() => {
                  if (!exportProject(project.id)) {
                    setError("That project could not be read.");
                  }
                }}
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
          <span className="text-sm font-semibold">Logits</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <SearchIcon
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <SidebarInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="pl-8"
            />
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" />}
              aria-label="Project actions"
            >
              <MoreHorizontalIcon />
            </DropdownMenuTrigger>
            {/* The trigger is an icon square, so the menu sizes itself rather
                than taking the trigger's width. */}
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={create}>
                <PlusIcon />
                New project
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={importFile}>
                <UploadIcon />
                Import circuit file…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {error && (
          <p role="alert" className="px-1 text-xs text-destructive">
            {error}
          </p>
        )}
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
        <GithubStarBanner />
        <p className="px-1 text-center text-xs text-muted-foreground">
          {projects.length} project{projects.length === 1 ? "" : "s"} ·{" "}
          <Kbd>⌘B</Kbd> to toggle
        </p>
      </SidebarFooter>

      <DeleteProjectDialog
        project={pendingDelete}
        onClose={() => setPendingDelete(null)}
        onDeleted={onDeleted}
      />
    </Sidebar>
  );
}

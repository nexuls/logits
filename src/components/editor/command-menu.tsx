"use client";

import {
  CopyIcon,
  CornerLeftUpIcon,
  PackagePlusIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  RotateCwIcon,
  SaveIcon,
  SkipForwardIcon,
  SquarePenIcon,
  Trash2Icon,
  UndoIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { useMemo } from "react";

import { nodeIcon } from "@/components/nodes/node-icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { GRID_SIZE } from "@/lib/circuit/geometry";
import { subcircuitDefinitions } from "@/lib/circuit/subcircuit";
import { canInstantiate } from "@/lib/circuit/subcircuit-commands";
import type { NodeDefinition } from "@/lib/nodes/define";
import {
  lookupNode,
  nodeCategories,
  nodeDefinitions,
} from "@/lib/nodes/registry";
import {
  closeSubcircuit,
  deleteSelection,
  duplicateSelection,
  flushSave,
  openSubcircuit,
  redo,
  rotateSelection,
  undo,
  useRootDocument,
  useSubcircuitPath,
} from "@/state/document";
import { clearSelection, useSelection } from "@/state/selection";
import {
  resetSimulation,
  stepSimulation,
  togglePlay,
  useSimulationStatus,
} from "@/state/simulation";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Places a node type at the viewport centre — the keyboard path to placing. */
  onPlace: (definition: NodeDefinition) => void;
  /** Opens the editor's prompt for making the selection a subcircuit. */
  onMakeSubcircuit: () => void;
};

/**
 * `Ctrl+K`: the keyboard route to everything the toolbar and palette do.
 *
 * The node half is generated from the registry, so a new node appears here for
 * free — the same rule the palette follows. Nothing in this file names a node
 * type or a category label; both come off the definitions.
 */
export default function CommandMenu({
  open,
  onOpenChange,
  onPlace,
  onMakeSubcircuit,
}: Props) {
  const selection = useSelection();
  const status = useSimulationStatus();
  const project = useRootDocument();
  const path = useSubcircuitPath();

  const hasSelection = selection.nodeIds.length + selection.wireIds.length > 0;

  // The project's chips, listed for placing alongside the registry's elements
  // and, separately, for opening — the only route to a chip's contents that
  // needs neither an instance of it on screen nor the palette open.
  const chips = useMemo(
    () => (project ? subcircuitDefinitions(project, lookupNode) : []),
    [project],
  );

  /**
   * The ones that can be placed where the user is. A chip may not be placed
   * inside itself, and the palette leaves those rows disabled rather than
   * offering a placement that could only ever be a mistake; this list has to
   * agree with it.
   */
  const placeableChips = useMemo(() => {
    const host = path.length > 0 ? path[path.length - 1] : null;
    if (!project || host === null) return chips;

    return chips.filter((definition) => {
      const key = definition.subcircuit?.(definition.defaultParams);
      return key === undefined || canInstantiate(project, host, key);
    });
  }, [chips, path, project]);

  const run = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };

  const categories = [...nodeCategories, { id: "other", label: "Other" }];
  const known = new Set(nodeCategories.map((category) => category.id));

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Place a node or run an editor command"
    >
      <CommandInput placeholder="Place a node, or type a command…" />
      <CommandList>
        <CommandEmpty>No matching command.</CommandEmpty>

        <CommandGroup heading="Simulation">
          <Action
            icon={status.mode === "running" ? PauseIcon : PlayIcon}
            label={status.mode === "running" ? "Pause" : "Run"}
            shortcut="Space"
            onSelect={run(togglePlay)}
          />
          <Action
            icon={SkipForwardIcon}
            label="Step one event"
            shortcut="."
            onSelect={run(stepSimulation)}
          />
          <Action
            icon={RotateCcwIcon}
            label="Reset simulation"
            onSelect={run(resetSimulation)}
          />
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Edit">
          <Action
            icon={UndoIcon}
            label="Undo"
            shortcut="⌘Z"
            onSelect={run(undo)}
          />
          <Action
            icon={UndoIcon}
            label="Redo"
            shortcut="⇧⌘Z"
            onSelect={run(redo)}
          />
          {hasSelection && (
            <>
              <Action
                icon={RotateCwIcon}
                label="Rotate selection"
                shortcut="R"
                onSelect={run(() => rotateSelection(selection.nodeIds))}
              />
              <Action
                icon={CopyIcon}
                label="Duplicate selection"
                shortcut="⌘D"
                onSelect={run(() =>
                  duplicateSelection(selection, {
                    x: GRID_SIZE * 2,
                    y: GRID_SIZE * 2,
                  }),
                )}
              />
              <Action
                icon={Trash2Icon}
                label="Delete selection"
                shortcut="⌫"
                onSelect={run(() => {
                  deleteSelection(selection);
                  clearSelection();
                })}
              />
            </>
          )}
          {hasSelection && (
            <Action
              icon={PackagePlusIcon}
              label="Make subcircuit from selection"
              shortcut="⌘G"
              onSelect={run(onMakeSubcircuit)}
            />
          )}
          <Action
            icon={SaveIcon}
            label="Save"
            shortcut="⌘S"
            onSelect={run(flushSave)}
          />
        </CommandGroup>

        {chips.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Subcircuits">
              {path.length > 0 && (
                <Action
                  icon={CornerLeftUpIcon}
                  label="Leave this subcircuit"
                  onSelect={run(closeSubcircuit)}
                />
              )}
              {chips.map((definition) => {
                const key = definition.subcircuit?.(definition.defaultParams);
                if (key === undefined) return null;

                return (
                  <CommandItem
                    key={definition.type}
                    value={`Edit ${definition.title} contents`}
                    onSelect={run(() => openSubcircuit(key))}
                  >
                    <SquarePenIcon />
                    <span>Edit “{definition.title}” contents</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}

        {categories.map((category) => {
          const items = [...nodeDefinitions, ...placeableChips].filter(
            (definition) =>
              category.id === "other"
                ? !known.has(definition.category)
                : definition.category === category.id,
          );
          if (items.length === 0) return null;

          return (
            <CommandGroup
              key={category.id}
              heading={`Place · ${category.label}`}
            >
              {items.map((definition) => {
                const Icon = nodeIcon(definition.icon);
                return (
                  <CommandItem
                    key={definition.type}
                    // Keywords go into the searchable value so "conjunction"
                    // finds the AND gate, as it does in the palette.
                    value={`${definition.title} ${definition.type} ${definition.keywords?.join(" ") ?? ""}`}
                    onSelect={run(() => onPlace(definition))}
                  >
                    <Icon />
                    <span>{definition.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}

function Action({
  icon: Icon,
  label,
  shortcut,
  onSelect,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onSelect: () => void;
}) {
  return (
    <CommandItem value={label} onSelect={onSelect}>
      <Icon />
      <span>{label}</span>
      {shortcut && <CommandShortcut>{shortcut}</CommandShortcut>}
    </CommandItem>
  );
}

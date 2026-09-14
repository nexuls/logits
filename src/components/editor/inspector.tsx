"use client";

import {
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  CircleDotIcon,
  InfoIcon,
  type LucideIcon,
  MinusIcon,
  PencilIcon,
  PlusIcon,
  RotateCwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import {
  type ChangeEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import type { Rect } from "@/lib/circuit/geometry";
import { listGroups, type NodeGroup } from "@/lib/circuit/groups";
import type {
  CircuitDocument,
  CircuitNode,
  LabelPosition,
} from "@/lib/circuit/schema";
import type { NodeDefinition, NodeParams, ParamSpec } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  deleteSelection,
  rotateSelection,
  updateNodeLabel,
  updateNodeLabelPosition,
  updateNodeParams,
  useDocument,
} from "@/state/document";
import { beginInPlaceEdit } from "@/state/in-place-edit";
import type { Scene } from "@/state/scene";
import {
  clearSelection,
  type SelectionState,
  useSelection,
} from "@/state/selection";
import NodeDocsDialog from "./node-docs-dialog";

type Props = {
  /** The selection's world-space box, or null when nothing is selected. */
  bounds: Rect | null;
  /** The element `InspectorAnchor` drew at `bounds`, inside the transform. */
  anchorRef: RefObject<HTMLDivElement | null>;
};

type InspectorProps = Props & {
  /**
   * A pointer gesture is in progress — the press that selects, or the drag
   * that moves what is selected. The popover stays away until it ends, so it
   * opens on the release rather than under the finger that is still pressing,
   * and is not in the way of the node being dragged
   * (artifacts/07-interaction-spec.md).
   */
  suppressed?: boolean;
};

/**
 * The property editor for the selection, shown on the canvas over what it
 * edits rather than in a panel across the screen from it.
 *
 * Every control it draws comes from the selected node's `paramsSchema`, so
 * adding a node with new parameters needs no change here (Non-negotiable #3),
 * and there is nothing in this file keyed by a node `type`.
 *
 * It edits one node at a time. A multi-node selection gets the actions that
 * are unambiguous — rotate, delete — rather than a merged parameter view that
 * would have to invent a meaning for "different values".
 *
 * It is deliberately split in two. `InspectorAnchor` renders *inside* the
 * canvas's transformed layer, so the popover can be placed against the
 * element's real on-screen rect at any pan or zoom. This part renders
 * *outside* the canvas — because a React portal bubbles its events up the
 * React tree, not the DOM tree, and a popup mounted under the canvas would
 * send every click in the form to the canvas's pointer handlers, which would
 * hit-test empty space and clear the selection out from under it.
 */
export default function Inspector({
  bounds,
  anchorRef,
  suppressed = false,
}: InspectorProps) {
  const selection = useSelection();

  // The same `bounds` the anchor was drawn from, so the popover cannot outlive
  // the element it is placed against by a frame.
  if (!bounds || suppressed) return null;

  // Keyed by what is selected: a new selection is a new popover, so the
  // uncontrolled fields inside reset to the node they now describe instead of
  // an effect chasing the store.
  const key = [...selection.nodeIds, ...selection.wireIds].join(" ");
  return (
    <SelectionPopover key={key} anchorRef={anchorRef} selection={selection} />
  );
}

/**
 * The anchor: the selection's own box in world coordinates, drawn inside the
 * canvas transform. It takes no pointer events — picking is hit-tested against
 * the scene, and a real target here would swallow the drag that moves the node.
 *
 * It is rendered before the popover that reads it, so the ref is attached by
 * the time the popup positions itself in the same commit.
 */
export function InspectorAnchor({ bounds, anchorRef }: Props) {
  if (!bounds) return null;

  return (
    <div
      ref={anchorRef}
      aria-hidden
      className="pointer-events-none absolute"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
      }}
    />
  );
}

function SelectionPopover({
  anchorRef,
  selection,
}: {
  anchorRef: RefObject<HTMLDivElement | null>;
  selection: SelectionState;
}) {
  const document = useDocument();

  const node =
    document && selection.nodeIds.length === 1
      ? document.nodes[selection.nodeIds[0]]
      : undefined;
  const definition = node ? lookupNode(node.type) : undefined;
  const total = selection.nodeIds.length + selection.wireIds.length;
  const [docsOpen, setDocsOpen] = useState(false);

  return (
    <Popover
      open
      onOpenChange={(_open, details) => {
        // The popover is a view of the selection, not a menu: the only
        // dismissal is dropping the selection. `outside-press` is ignored
        // because the press that starts dragging the selected node is
        // "outside", and a close there would not come back on release —
        // hiding for the length of a gesture is `suppressed`'s job, and it
        // knows when the gesture ends.
        if (details.reason === "escape-key") clearSelection();
      }}
    >
      <PopoverContent
        anchor={anchorRef}
        side="top"
        sideOffset={12}
        // Focus stays on the canvas: selecting a node must not move the
        // caret off it, and closing must not throw focus at a trigger that
        // does not exist.
        initialFocus={false}
        finalFocus={false}
        // Sectioned rather than one stack: a header naming what is selected,
        // the fields, then the actions. The rules between them are what let
        // the eye find a field's edges, so the popup does not read as one
        // undifferentiated column of controls.
        className="w-68 gap-0 overflow-hidden rounded-xl p-0"
      >
        {/* The help button is a sibling of the title, not inside it, so the
            popover's accessible name stays the element's title alone. */}
        <div className="flex items-center gap-2 border-b border-border/60 py-1.5 pr-2 pl-3.5">
          <PopoverTitle className="min-w-0 flex-1 truncate py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {node
              ? (definition?.title ?? node.type)
              : `${total} element${total === 1 ? "" : "s"} selected`}
          </PopoverTitle>
          {definition && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setDocsOpen(true)}
              aria-label={`About ${definition.title}`}
              aria-haspopup="dialog"
              title={`About ${definition.title}`}
              className="text-muted-foreground"
            >
              <InfoIcon />
            </Button>
          )}
        </div>

        {/* Mounted only once opened, like the palette's. The editor shortcuts
            stand down inside a dialog, so Delete or Esc here act on the
            dialog, not on the node it describes. */}
        {definition && docsOpen && (
          <NodeDocsDialog
            definition={definition}
            open={docsOpen}
            onOpenChange={setDocsOpen}
          />
        )}

        {(node || !definition) && (
          <div className="flex flex-col gap-4 px-3.5 py-3.5">
            {/* A decoration's words are its own content, so it has no label. */}
            {node && !definition?.decoration && (
              <Field htmlFor="inspector-label" label="Label">
                <LabelField
                  nodeId={node.id}
                  label={node.label ?? ""}
                  position={node.labelPosition ?? "bottom"}
                  placeholder={definition?.title ?? node.type}
                />
              </Field>
            )}

            {node &&
              document &&
              definition?.paramsSchema?.map((spec) =>
                // The param that names a group is picked from the groups that
                // exist rather than typed blind; see `NodeDefinition.group`.
                spec.kind === "text" && definition.editInPlace === spec.key ? (
                  // Edited where it sits on the canvas, not in a second,
                  // cramped copy of the editor here.
                  <InPlaceField key={spec.key} spec={spec} nodeId={node.id} />
                ) : spec.kind === "text" &&
                  definition.group?.key === spec.key ? (
                  <GroupField
                    key={spec.key}
                    spec={spec}
                    node={node}
                    definition={definition}
                    document={document}
                  />
                ) : (
                  <ParamField
                    key={spec.key}
                    spec={spec}
                    params={node.params}
                    onChange={(value) =>
                      updateNodeParams(node.id, { [spec.key]: value })
                    }
                  />
                ),
              )}

            {node && !definition && (
              <p className="text-xs text-destructive">
                This build has no definition for “{node.type}”, so it cannot be
                configured or simulated. Its wiring is preserved.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2 border-t border-border/60 px-3.5 py-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1"
            disabled={selection.nodeIds.length === 0}
            onClick={() => rotateSelection(selection.nodeIds)}
          >
            <RotateCwIcon />
            Rotate
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="flex-1 text-destructive hover:text-destructive"
            onClick={() => {
              deleteSelection(selection);
              clearSelection();
            }}
          >
            <Trash2Icon />
            Delete
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * World-space box around everything selected, which is what the popover is
 * placed against. Null when nothing is selected — the popover does not exist
 * then, rather than existing with an empty anchor.
 */
export function selectionBounds(
  scene: Scene,
  selection: SelectionState,
): Rect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const id of selection.nodeIds) {
    const resolved = scene.nodes[id];
    if (!resolved) continue;
    minX = Math.min(minX, resolved.bounds.x);
    minY = Math.min(minY, resolved.bounds.y);
    maxX = Math.max(maxX, resolved.bounds.x + resolved.bounds.width);
    maxY = Math.max(maxY, resolved.bounds.y + resolved.bounds.height);
  }

  // A wire-only selection is anchored on the wire it is about, so "delete"
  // still appears next to the thing it deletes.
  for (const id of selection.wireIds) {
    const wire = scene.wires[id];
    if (!wire) continue;
    for (const point of wire.points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

type FieldProps = {
  spec: ParamSpec;
  params: NodeParams;
  onChange: (value: unknown) => void;
};

/**
 * The node's own name, overriding the definition's title on the canvas, and
 * the side of the body it is drawn on. Uncontrolled — the popover is keyed by
 * the selection, so a new node is a new field.
 */
function LabelField({
  nodeId,
  label,
  position,
  placeholder,
}: {
  nodeId: string;
  label: string;
  position: LabelPosition;
  placeholder: string;
}) {
  return (
    <div className="flex gap-1.5">
      <div className="min-w-0 flex-1">
        <CommitInput
          id="inspector-label"
          initial={label}
          placeholder={placeholder}
          onCommit={(value) => updateNodeLabel(nodeId, value)}
        />
      </div>
      <LabelPositionPicker nodeId={nodeId} position={position} />
    </div>
  );
}

/**
 * The five placements in the order a reader meets them, each with the grid
 * cell it sits in — so the picker is laid out as the node it describes, with
 * the centre in the middle, and Tab walks it top to bottom.
 */
const LABEL_POSITIONS: readonly {
  value: LabelPosition;
  label: string;
  Icon: LucideIcon;
  cell: string;
}[] = [
  {
    value: "top",
    label: "Top",
    Icon: ArrowUpIcon,
    cell: "col-start-2 row-start-1",
  },
  {
    value: "left",
    label: "Left",
    Icon: ArrowLeftIcon,
    cell: "col-start-1 row-start-2",
  },
  {
    value: "center",
    label: "Center",
    Icon: CircleDotIcon,
    cell: "col-start-2 row-start-2",
  },
  {
    value: "right",
    label: "Right",
    Icon: ArrowRightIcon,
    cell: "col-start-3 row-start-2",
  },
  {
    value: "bottom",
    label: "Bottom",
    Icon: ArrowDownIcon,
    cell: "col-start-2 row-start-3",
  },
];

/**
 * Where the label goes, as a pad of five buttons in a popup of its own rather
 * than a select: the choice is spatial, and a cross of arrows around the
 * middle says "which side" at a glance where a list of words has to be read.
 *
 * Each press is one command, so one undo entry. The trigger wears the current
 * placement's icon, and the chosen button is marked with `aria-pressed` and a
 * filled style — a shape difference, not only a colour one.
 */
function LabelPositionPicker({
  nodeId,
  position,
}: {
  nodeId: string;
  position: LabelPosition;
}) {
  const [open, setOpen] = useState(false);
  const current =
    LABEL_POSITIONS.find((option) => option.value === position) ??
    LABEL_POSITIONS[LABEL_POSITIONS.length - 1];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            size="icon-lg"
            aria-label={`Label position: ${current.label}`}
            title={`Label position: ${current.label}`}
          />
        }
      >
        <current.Icon />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="w-auto gap-0 rounded-xl p-2"
      >
        <fieldset
          aria-label="Label position"
          className="m-0 grid grid-cols-3 grid-rows-3 gap-1 border-0 p-0"
        >
          {LABEL_POSITIONS.map(({ value, label, Icon, cell }) => (
            <Button
              key={value}
              type="button"
              variant={value === position ? "default" : "outline"}
              size="icon-sm"
              aria-label={label}
              aria-pressed={value === position}
              title={label}
              className={cell}
              onClick={() => {
                updateNodeLabelPosition(nodeId, value);
                setOpen(false);
              }}
            >
              <Icon />
            </Button>
          ))}
        </fieldset>
      </PopoverContent>
    </Popover>
  );
}

/**
 * A text input that writes to the document when editing ends rather than per
 * keystroke, so one editing session is one undo entry.
 *
 * "Ends" is blur *and* unmount. The unmount commit is the one that matters: a
 * press anywhere on the canvas — clearing the selection, picking another node,
 * starting a drag — removes the popover while this input still has focus, and
 * a removed element fires no blur, so without it a value typed and then
 * clicked away from was silently thrown away.
 */
function CommitInput({
  id,
  initial,
  placeholder,
  maxLength,
  multiline = false,
  onCommit,
}: {
  id: string;
  initial: string;
  placeholder?: string;
  maxLength?: number;
  /** A textarea, for prose — Enter is a new line, not the end of the edit. */
  multiline?: boolean;
  onCommit: (value: string) => void;
}) {
  // Refs, not state: these are only read back at commit time, and a render per
  // keystroke would rebuild the scene for a field the canvas cannot see.
  const typed = useRef(initial);
  const committed = useRef(initial);
  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;

  // Skipping an unchanged value keeps a click through the field from leaving
  // an empty entry on the undo stack.
  const commit = useCallback(() => {
    if (typed.current === committed.current) return;
    committed.current = typed.current;
    onCommitRef.current(typed.current);
  }, []);

  useEffect(() => commit, [commit]);

  const field = {
    id,
    defaultValue: initial,
    placeholder,
    maxLength,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      typed.current = event.target.value;
    },
    onBlur: commit,
  };

  return multiline ? (
    <Textarea
      {...field}
      rows={5}
      spellCheck
      // Grows with its content up to a point, then scrolls, so a long note
      // does not push the popover's actions off the screen.
      className="max-h-56 min-h-24 rounded-lg font-mono text-xs md:text-xs"
    />
  ) : (
    <Input {...field} className="h-9" />
  );
}

/**
 * A group's name — a tunnel's network — as a searchable list of the groups
 * already in the document, each with its member count and shared params, plus
 * an "add" row when what is typed names none of them.
 *
 * Picking commits at once, through `updateNodeParams`, so the command adopts
 * the group's shared params and the pick is one undo step. Typing alone never
 * commits: a name is chosen or added, not half-typed into a network that then
 * silently joins something. While the list is closed the input shows the
 * document's value, so an undo with the popover open is not hidden behind a
 * stale query.
 */
function GroupField({
  spec,
  node,
  definition,
  document,
}: {
  spec: Extract<ParamSpec, { kind: "text" }>;
  node: CircuitNode;
  definition: NodeDefinition;
  document: CircuitDocument;
}) {
  const id = `param-${spec.key}`;
  const noun = definition.group?.noun ?? "group";
  const raw = node.params[spec.key];
  const current = typeof raw === "string" ? raw.trim() : "";

  const groups = useMemo(
    () => listGroups(document, node.type, lookupNode),
    [document, node.type],
  );
  const byName = useMemo(
    () => new Map(groups.map((group) => [group.name, group])),
    [groups],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(current);
  // What the list is filtered by — only what the user typed, so opening the
  // list on a named node shows every group rather than just its own.
  const [filter, setFilter] = useState("");

  const needle = filter.trim();
  const items = useMemo(() => {
    const lower = needle.toLowerCase();
    const names = groups
      .filter((group) => group.name.toLowerCase().includes(lower))
      .map((group) => group.name);
    // The new name goes last, so Enter on an exact-prefix match still picks
    // the existing group.
    if (needle.length > 0 && !byName.has(needle)) names.push(needle);
    return names;
  }, [groups, byName, needle]);

  const commit = (name: string) => {
    if (name !== current) updateNodeParams(node.id, { [spec.key]: name });
  };

  const own = current ? byName.get(current) : undefined;
  const peers = own ? own.memberIds.length - 1 : 0;
  const hint =
    peers > 0
      ? `Linked to ${countOf(peers, definition.title)}; shared settings change on all of them.`
      : spec.hint;

  return (
    <Field htmlFor={id} label={spec.label} hint={hint}>
      <Combobox<string>
        items={items}
        // Filtered above, so a query can offer a row that is not in `groups`.
        filter={null}
        value={current || null}
        inputValue={open ? query : current}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setQuery(current);
          setFilter("");
        }}
        onInputValueChange={(value, details) => {
          setQuery(value);
          if (details.reason === "input-change") setFilter(value);
        }}
        onValueChange={(value) => {
          commit(typeof value === "string" ? value.trim() : "");
          setFilter("");
        }}
        autoHighlight
      >
        <ComboboxInput
          id={id}
          placeholder={`Pick or add a ${noun}`}
          maxLength={spec.maxLength}
          showClear={current.length > 0}
          className="h-9 w-full"
        />
        <ComboboxContent>
          <ComboboxEmpty>
            {groups.length === 0
              ? `No ${noun}s yet — type a name to add one.`
              : `No ${noun} matches.`}
          </ComboboxEmpty>
          <ComboboxList>
            {(name: string) => {
              const group = byName.get(name);
              return group ? (
                <ComboboxItem key={name} value={name}>
                  <GroupOption
                    group={group}
                    definition={definition}
                    current={name === current}
                  />
                </ComboboxItem>
              ) : (
                <ComboboxItem key={name} value={name}>
                  <PlusIcon />
                  <span className="min-w-0 truncate">
                    Add {noun} “<span className="font-mono">{name}</span>”
                  </span>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}

/** One existing group in the list: its name, then what is on it. */
function GroupOption({
  group,
  definition,
  current,
}: {
  group: NodeGroup;
  definition: NodeDefinition;
  current: boolean;
}) {
  const details = Object.entries(group.shared).map(([key, entry]) => {
    const label =
      definition.paramsSchema?.find((spec) => spec.key === key)?.label ?? key;
    return { key, label, value: entry.value, mixed: entry.mixed };
  });

  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="truncate font-mono text-xs">{group.name}</span>
      <span className="flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
        <span>
          {countOf(group.memberIds.length, definition.title)}
          {current && " (incl. this one)"}
        </span>
        {details.map(({ key, label, value, mixed }) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span aria-hidden>·</span>
            {mixed ? (
              <>
                <TriangleAlertIcon className="size-3 text-destructive" />
                {label}: mixed
              </>
            ) : (
              `${label}: ${String(value ?? "—")}`
            )}
          </span>
        ))}
      </span>
    </span>
  );
}

/** "1 tunnel", "3 tunnels" — the member noun is the definition's title. */
function countOf(count: number, title: string): string {
  const noun = title.toLowerCase();
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/**
 * A param the node edits on the canvas (`NodeDefinition.editInPlace`): a
 * button that opens that editor. Double-clicking the node, or Enter while it
 * is selected, does the same.
 */
function InPlaceField({
  spec,
  nodeId,
}: {
  spec: Extract<ParamSpec, { kind: "text" }>;
  nodeId: string;
}) {
  return (
    <Field
      label={spec.label}
      hint={spec.hint ?? "Or double-click it on the canvas."}
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full justify-start"
        onClick={() => beginInPlaceEdit(nodeId)}
      >
        <PencilIcon />
        Edit {spec.label.toLowerCase()}
      </Button>
    </Field>
  );
}

/**
 * The frame every control sits in: label above, control below, hint under
 * that. One place, so no field can drift into its own spacing and the gap
 * between two fields always reads as larger than the gap inside one.
 */
function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  htmlFor?: string;
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={htmlFor}
        className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase"
      >
        {label}
      </Label>
      {children}
      {hint && <Hint>{hint}</Hint>}
    </div>
  );
}

/**
 * One parameter control, chosen by `kind`.
 *
 * The `kind` set is closed and small on purpose: the inspector has to pick a
 * widget, and a node author picking from five is a clearer contract than one
 * describing a value's type and hoping the right control falls out.
 */
function ParamField({ spec, params, onChange }: FieldProps) {
  const id = `param-${spec.key}`;
  const raw = params[spec.key];

  if (spec.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id} className="text-xs font-normal">
          {spec.label}
        </Label>
        <Switch
          id={id}
          checked={raw === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      </div>
    );
  }

  if (spec.kind === "color") {
    const value = typeof raw === "string" ? raw : "";
    return (
      <Field label={spec.label} hint={spec.hint}>
        {/* A radio group, not a select: four hues fit in a row, and picking
            one is a single click instead of open-scan-click. The checked one
            is drawn as a disc, a gap, then a ring — a shape difference, so the
            choice is not carried by colour alone, and unlike the primitive's
            inner dot it does not have to contrast with every hue. */}
        <RadioGroup
          value={value}
          onValueChange={(next) => onChange(next)}
          aria-label={spec.label}
          className="flex w-full flex-row flex-wrap items-center gap-2.5"
        >
          {spec.options.map((option) => (
            <RadioGroupItem
              key={option.value}
              value={option.value}
              aria-label={option.label}
              title={option.label}
              style={{ background: option.swatch }}
              // `after:inset-0` undoes the primitive's oversized tap target,
              // which would otherwise overlap the neighbouring swatch and let
              // one steal the other's clicks.
              className="size-6 border-2 border-border/70 ring-offset-1 ring-offset-popover transition-[border-width,box-shadow] after:inset-0 data-checked:border-4 data-checked:border-popover data-checked:ring-2 data-checked:ring-ring [&_[data-slot=radio-group-indicator]]:hidden"
            />
          ))}
        </RadioGroup>
      </Field>
    );
  }

  if (spec.kind === "select") {
    return (
      <Field htmlFor={id} label={spec.label} hint={spec.hint}>
        <NativeSelect
          id={id}
          value={typeof raw === "string" ? raw : ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 w-full"
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
      </Field>
    );
  }

  if (spec.kind === "text") {
    return (
      <Field htmlFor={id} label={spec.label} hint={spec.hint}>
        <CommitInput
          id={id}
          initial={typeof raw === "string" ? raw : ""}
          maxLength={spec.maxLength}
          multiline={spec.multiline}
          onCommit={onChange}
        />
      </Field>
    );
  }

  const step = spec.step ?? 1;
  const current = typeof raw === "number" ? raw : (spec.min ?? 0);
  // Clamped here rather than in the node: a definition that had to defend
  // against a nonsense width would be defending against this control, and it
  // is the control that should not produce one.
  const nudge = (delta: number) =>
    onChange(clamp(current + delta, spec.min, spec.max));

  return (
    <Field htmlFor={id} label={spec.label} hint={spec.hint}>
      <InputGroup className="h-9">
        <InputGroupAddon align="inline-start">
          <InputGroupButton
            size="icon-xs"
            aria-label={`Decrease ${spec.label}`}
            disabled={spec.min !== undefined && current <= spec.min}
            onClick={() => nudge(-step)}
          >
            <MinusIcon />
          </InputGroupButton>
        </InputGroupAddon>

        <InputGroupInput
          id={id}
          type="number"
          inputMode="numeric"
          min={spec.min}
          max={spec.max}
          step={step}
          value={typeof raw === "number" ? raw : ""}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            if (!Number.isFinite(value)) return;
            onChange(clamp(value, spec.min, spec.max));
          }}
          // The native spinners are redundant next to the two buttons, and at
          // this size they crowd the value they sit on.
          className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />

        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={`Increase ${spec.label}`}
            disabled={spec.max !== undefined && current >= spec.max}
            onClick={() => nudge(step)}
          >
            <PlusIcon />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </Field>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

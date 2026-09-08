"use client";

import { RotateCwIcon, Trash2Icon } from "lucide-react";
import type { ReactNode, RefObject } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Popover, PopoverContent, PopoverTitle } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import type { Rect } from "@/lib/circuit/geometry";
import type { NodeParams, ParamSpec } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  deleteSelection,
  rotateSelection,
  updateNodeLabel,
  updateNodeParams,
  useDocument,
} from "@/state/document";
import type { Scene } from "@/state/scene";
import {
  clearSelection,
  type SelectionState,
  useSelection,
} from "@/state/selection";

type Props = {
  /** The selection's world-space box, or null when nothing is selected. */
  bounds: Rect | null;
  /** The element `InspectorAnchor` drew at `bounds`, inside the transform. */
  anchorRef: RefObject<HTMLDivElement | null>;
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
export default function Inspector({ bounds, anchorRef }: Props) {
  const selection = useSelection();

  // The same `bounds` the anchor was drawn from, so the popover cannot outlive
  // the element it is placed against by a frame.
  if (!bounds) return null;

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

  return (
    <Popover
      open
      onOpenChange={(_open, details) => {
        // The popover is a view of the selection, not a menu: the only
        // dismissal is dropping the selection. Ignoring `outside-press`
        // matters — the press that starts dragging the selected node is
        // "outside", and closing on it would make the panel flicker away
        // every time the node moved.
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
        className="w-60 gap-3 rounded-xl p-3"
      >
        <PopoverTitle className="text-xs font-medium text-muted-foreground">
          {node
            ? (definition?.title ?? node.type)
            : `${total} element${total === 1 ? "" : "s"} selected`}
        </PopoverTitle>

        {node && (
          <div className="space-y-1.5">
            <Label htmlFor="inspector-label" className="text-xs">
              Label
            </Label>
            <Input
              id="inspector-label"
              defaultValue={node.label ?? ""}
              placeholder={definition?.title ?? node.type}
              onBlur={(event) => updateNodeLabel(node.id, event.target.value)}
              className="h-8"
            />
          </div>
        )}

        {node &&
          definition?.paramsSchema?.map((spec) => (
            <ParamField
              key={spec.key}
              spec={spec}
              params={node.params}
              onChange={(value) =>
                updateNodeParams(node.id, { [spec.key]: value })
              }
            />
          ))}

        {node && !definition && (
          <p className="text-xs text-destructive">
            This build has no definition for “{node.type}”, so it cannot be
            configured or simulated. Its wiring is preserved.
          </p>
        )}

        <div className="flex gap-2">
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
            className="flex-1"
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
 * One parameter control, chosen by `kind`.
 *
 * The `kind` set is closed and small on purpose: the inspector has to pick a
 * widget, and a node author picking from four is a clearer contract than one
 * describing a value's type and hoping the right control falls out.
 */
function ParamField({ spec, params, onChange }: FieldProps) {
  const id = `param-${spec.key}`;
  const raw = params[spec.key];

  if (spec.kind === "bool") {
    return (
      <div className="flex items-center justify-between gap-2">
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

  if (spec.kind === "select") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          {spec.label}
        </Label>
        <NativeSelect
          id={id}
          value={typeof raw === "string" ? raw : ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full"
        >
          {spec.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect>
        {spec.hint && <Hint>{spec.hint}</Hint>}
      </div>
    );
  }

  if (spec.kind === "text") {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={id} className="text-xs">
          {spec.label}
        </Label>
        <Input
          id={id}
          defaultValue={typeof raw === "string" ? raw : ""}
          maxLength={spec.maxLength}
          onBlur={(event) => onChange(event.target.value)}
          className="h-8"
        />
        {spec.hint && <Hint>{spec.hint}</Hint>}
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {spec.label}
      </Label>
      <Input
        id={id}
        type="number"
        min={spec.min}
        max={spec.max}
        step={spec.step ?? 1}
        value={typeof raw === "number" ? raw : ""}
        onChange={(event) => {
          const value = Number.parseInt(event.target.value, 10);
          if (!Number.isFinite(value)) return;
          // Clamped here rather than in the node: a definition that had to
          // defend against a nonsense width would be defending against this
          // control, and it is the control that should not produce one.
          onChange(clamp(value, spec.min, spec.max));
        }}
        className="h-8"
      />
      {spec.hint && <Hint>{spec.hint}</Hint>}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[11px] text-muted-foreground">{children}</p>;
}

function clamp(value: number, min?: number, max?: number): number {
  return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, value));
}

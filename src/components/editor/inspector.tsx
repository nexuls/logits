"use client";

import { RotateCwIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Switch } from "@/components/ui/switch";
import type { NodeParams, ParamSpec } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  deleteSelection,
  rotateSelection,
  updateNodeLabel,
  updateNodeParams,
  useDocument,
} from "@/state/document";
import { clearSelection, useSelection } from "@/state/selection";

/**
 * The property editor for the selection.
 *
 * Every control it draws comes from the selected node's `paramsSchema`, so
 * adding a node with new parameters needs no change here (Non-negotiable #3),
 * and there is nothing in this file keyed by a node `type`.
 *
 * It edits one node at a time. A multi-node selection gets the actions that
 * are unambiguous — rotate, delete — rather than a merged parameter view that
 * would have to invent a meaning for "different values".
 */
export default function Inspector() {
  const document = useDocument();
  const selection = useSelection();

  const total = selection.nodeIds.length + selection.wireIds.length;
  if (!document || total === 0) return null;

  const node =
    selection.nodeIds.length === 1
      ? document.nodes[selection.nodeIds[0]]
      : undefined;
  const definition = node ? lookupNode(node.type) : undefined;

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        {node
          ? (definition?.title ?? node.type)
          : `${total} element${total === 1 ? "" : "s"} selected`}
      </SidebarGroupLabel>

      <SidebarGroupContent className="space-y-3 px-2 pt-1">
        {node && (
          <div className="space-y-1.5">
            <Label htmlFor="inspector-label" className="text-xs">
              Label
            </Label>
            <Input
              id="inspector-label"
              // Uncontrolled per node: remounting on selection resets the field
              // to the new node without an effect chasing the store.
              key={node.id}
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

        <div className="flex gap-2 pt-1">
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
      </SidebarGroupContent>
    </SidebarGroup>
  );
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

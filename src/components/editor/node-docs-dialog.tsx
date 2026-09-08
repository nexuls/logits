"use client";

import type { ReactNode } from "react";

import { nodeIcon } from "@/components/nodes/node-icons";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Markdown } from "@/components/ui/markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { NodeDefinition, ParamSpec } from "@/lib/nodes/define";

type Props = {
  definition: NodeDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The palette's "what is this element" dialog.
 *
 * Everything it shows comes off the definition, so a new node gains a help
 * page by writing `docs` and nothing here changes (Non-negotiable #3). The pin
 * and settings tables are *derived* from `pins()` and `paramsSchema` rather
 * than restated in the Markdown — that way they cannot drift from the element
 * the canvas actually draws, and the prose is free to be about behaviour.
 *
 * Pins are shown for `defaultParams`, since a palette entry is not an instance
 * and has no params of its own; a definition whose pin count follows a param
 * says so in its own prose.
 */
export default function NodeDocsDialog({
  definition,
  open,
  onOpenChange,
}: Props) {
  const Icon = nodeIcon(definition.icon);
  const pins = definition.pins(definition.defaultParams);
  const params = definition.paramsSchema ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
        <DialogHeader className="shrink-0 flex-row gap-6 border-b border-border p-6 pb-4">
          <DialogTitle className="flex items-center gap-2.5 text-base">
            <Icon aria-hidden className="size-5 text-muted-foreground" />
            {definition.title}
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2">
            <code className="rounded-lg bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              {definition.type}
            </code>
            <span className="text-xs">
              {pins.length} {pins.length === 1 ? "pin" : "pins"}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1 *:data-[slot=scroll-area-viewport]:absolute *:data-[slot=scroll-area-viewport]:inset-0">
          <div className="p-6 pt-5">
            {definition.docs ? (
              <Markdown>{definition.docs}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground">
                No description has been written for this element yet.
              </p>
            )}

            <Section title="Pins">
              {pins.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This element has no pins.
                </p>
              ) : (
                <Table head={["Pin", "Direction", "Width", "Side"]}>
                  {pins.map((pin) => (
                    <tr key={pin.id} className="border-b border-border/60">
                      <Cell>
                        <span className="font-medium text-foreground">
                          {pin.name}
                        </span>{" "}
                        <code className="font-mono text-[0.85em]">
                          {pin.id}
                        </code>
                      </Cell>
                      <Cell>
                        {pin.direction === "in"
                          ? "Input"
                          : pin.direction === "out"
                            ? "Output"
                            : "Bidirectional"}
                        {/* Tri-state is why several outputs may legitimately
                            share a net, so it belongs beside the direction
                            rather than buried in the prose. */}
                        {pin.tristate && (
                          <Badge variant="secondary" className="ml-1.5">
                            tri-state
                          </Badge>
                        )}
                      </Cell>
                      <Cell>
                        {pin.width} {pin.width === 1 ? "bit" : "bits"}
                      </Cell>
                      <Cell className="capitalize">{pin.side}</Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>

            {params.length > 0 && (
              <Section title="Settings">
                <Table head={["Setting", "Control", "Default"]}>
                  {params.map((param) => (
                    <tr key={param.key} className="border-b border-border/60">
                      <Cell>
                        <span className="font-medium text-foreground">
                          {param.label}
                        </span>
                        {param.hint && (
                          <span className="block text-muted-foreground">
                            {param.hint}
                          </span>
                        )}
                      </Cell>
                      <Cell>{controlLabel(param)}</Cell>
                      <Cell>
                        <code className="font-mono text-[0.85em]">
                          {formatValue(definition.defaultParams[param.key])}
                        </code>
                      </Cell>
                    </tr>
                  ))}
                </Table>
              </Section>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-base font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function Table({
  head,
  children,
}: {
  head: readonly string[];
  children: ReactNode;
}) {
  return (
    // Scrolls inside its own box: a wide table must not widen the dialog.
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full border-collapse text-sm text-muted-foreground">
        <thead className="bg-muted/60">
          <tr>
            {head.map((label) => (
              <th
                key={label}
                className="border-b border-border px-2.5 py-1.5 text-left font-semibold whitespace-nowrap"
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <td className={`px-2.5 py-1.5 align-top ${className ?? ""}`}>{children}</td>
  );
}

/** What the inspector will offer for this param, in words. */
function controlLabel(param: ParamSpec): string {
  switch (param.kind) {
    case "int":
      return param.min !== undefined && param.max !== undefined
        ? `Number, ${param.min}–${param.max}`
        : "Number";
    case "bool":
      return "On / off";
    case "text":
      return "Text";
    case "select":
      return param.options.map((option) => option.label).join(" · ");
    case "color":
      return param.options.map((option) => option.label).join(" · ");
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value.length > 0 ? value : "(empty)";
  return String(value);
}

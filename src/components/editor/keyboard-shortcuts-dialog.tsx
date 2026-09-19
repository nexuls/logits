"use client";

import { Fragment } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Shortcut = {
  action: string;
  /** Alternatives, each a `+`-joined chord. `Mod` is Cmd on a Mac, else Ctrl. */
  keys: string[];
};

/**
 * Mirrors artifacts/07-interaction-spec.md, which stays the source of truth —
 * a binding added in `use-editor-shortcuts.ts` belongs in both.
 */
const GROUPS: { title: string; shortcuts: Shortcut[] }[] = [
  {
    title: "General",
    shortcuts: [
      { action: "Command menu", keys: ["Mod+K"] },
      { action: "Save now", keys: ["Mod+S"] },
      { action: "Toggle projects sidebar", keys: ["Mod+B"] },
      { action: "Toggle elements sidebar", keys: ["Mod+J"] },
      { action: "Keyboard shortcuts", keys: ["?"] },
    ],
  },
  {
    title: "Simulation",
    shortcuts: [
      { action: "Run / pause (tap)", keys: ["Space"] },
      { action: "Step one event", keys: ["."] },
    ],
  },
  {
    title: "Editing",
    shortcuts: [
      { action: "Select everything", keys: ["Mod+A"] },
      { action: "Undo", keys: ["Mod+Z"] },
      { action: "Redo", keys: ["Mod+Shift+Z", "Mod+Y"] },
      { action: "Copy", keys: ["Mod+C"] },
      { action: "Cut", keys: ["Mod+X"] },
      { action: "Paste at pointer", keys: ["Mod+V"] },
      { action: "Duplicate", keys: ["Mod+D"] },
      { action: "Rotate 90°", keys: ["R"] },
      { action: "Rotate back", keys: ["Shift+R"] },
      { action: "Delete selection", keys: ["Delete", "Backspace"] },
      { action: "Make selection a subcircuit", keys: ["Mod+G"] },
      {
        action: "Edit selected note, or open selected subcircuit",
        keys: ["Enter"],
      },
      { action: "Cancel placing, wiring, selection", keys: ["Esc"] },
    ],
  },
  {
    title: "Canvas",
    shortcuts: [
      { action: "Pan", keys: ["Wheel", "Space+Drag"] },
      { action: "Pan horizontally", keys: ["Shift+Wheel"] },
      { action: "Zoom at pointer", keys: ["Mod+Wheel"] },
      { action: "Move without snapping", keys: ["Alt+Drag"] },
      { action: "Move between nodes and pins", keys: ["Tab"] },
    ],
  },
  {
    title: "Projects sidebar",
    shortcuts: [
      { action: "Rename project", keys: ["F2"] },
      { action: "Delete project", keys: ["Delete"] },
    ],
  },
];

export default function KeyboardShortcutsDialog({ open, onOpenChange }: Props) {
  // Read while open only, and the popup is never server-rendered, so this
  // cannot cause a hydration mismatch.
  const mac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPad/.test(navigator.userAgent);
  const names: Record<string, string> = mac
    ? { Mod: "⌘", Shift: "⇧", Alt: "⌥" }
    : { Mod: "Ctrl" };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] gap-4 overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Editor shortcuts pause while you type in a field.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="mb-1 text-xs font-medium text-muted-foreground">
                {group.title}
              </h3>
              <dl className="divide-y divide-border/50">
                {group.shortcuts.map((shortcut) => (
                  <div
                    key={shortcut.action}
                    className="flex items-center justify-between gap-4 py-1.5"
                  >
                    <dt className="text-sm">{shortcut.action}</dt>
                    <dd className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                      {shortcut.keys.map((chord, index) => (
                        <Fragment key={chord}>
                          {index > 0 && <span>or</span>}
                          <KbdGroup>
                            {chord.split("+").map((key) => (
                              <Kbd key={key}>{names[key] ?? key}</Kbd>
                            ))}
                          </KbdGroup>
                        </Fragment>
                      ))}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

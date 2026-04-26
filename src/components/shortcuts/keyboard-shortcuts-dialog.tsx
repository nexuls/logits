"use client";

import { useEffect, useMemo, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { allPlugins } from "@/components/draftly/plugins";
import type { DraftlyPlugin } from "@/components/draftly/editor/plugin";

/**
 * Window event name used to programmatically open the shortcuts dialog
 * from anywhere in the app (e.g. a menu item). Dispatch with
 * `window.dispatchEvent(new Event(KEYBOARD_SHORTCUTS_EVENT))`.
 */
export const KEYBOARD_SHORTCUTS_EVENT = "logits:open-keyboard-shortcuts";

type ShortcutEntry = {
  /** Raw CodeMirror key string (e.g. "Mod-Shift-i") */
  key: string;
  /** Short action name (e.g. "Bold") */
  name: string;
  /** Optional one-line description of the action */
  description?: string;
};

type ShortcutGroup = {
  title: string;
  entries: ShortcutEntry[];
};

/**
 * Manually-curated interface shortcuts. These are not part of the editor
 * plugin system and so must be listed here explicitly.
 */
const interfaceShortcuts: ShortcutEntry[] = [
  {
    key: "Mod-/",
    name: "Toggle sidebar",
    description: "Show or hide the application sidebar",
  },
  {
    key: "Mod-Shift-/",
    name: "Show keyboard shortcuts",
    description: "Open this keyboard shortcuts panel",
  },
];

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Mac|iPhone|iPad|iPod/i.test(navigator.platform);
}

function formatKeyToken(token: string, mac: boolean): string {
  switch (token) {
    case "Mod":
      return mac ? "⌘" : "Ctrl";
    case "Cmd":
      return mac ? "⌘" : "Cmd";
    case "Ctrl":
      return mac ? "⌃" : "Ctrl";
    case "Shift":
      return mac ? "⇧" : "Shift";
    case "Alt":
      return mac ? "⌥" : "Alt";
    case "ArrowUp":
      return "↑";
    case "ArrowDown":
      return "↓";
    case "ArrowLeft":
      return "←";
    case "ArrowRight":
      return "→";
    default:
      return token;
  }
}

function splitKeyParts(key: string): string[] {
  return key.split("-").filter((part) => part.length > 0);
}

/**
 * Title-case a plugin name like "code-plugin" → "Code".
 */
function prettifyPluginName(name: string): string {
  const trimmed = name.replace(/-?plugin$/i, "");
  if (!trimmed) return name;
  return trimmed
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Discovers shortcut groups from the essential plugin set.
 * Each plugin exposes its bindings via `getKeymap()`.
 */
function discoverPluginShortcuts(plugins: DraftlyPlugin[]): ShortcutGroup[] {
  const groups: ShortcutGroup[] = [];

  for (const plugin of plugins) {
    let bindings: ReturnType<DraftlyPlugin["getKeymap"]> = [];
    try {
      bindings = plugin.getKeymap();
    } catch {
      bindings = [];
    }
    if (!bindings || bindings.length === 0) continue;

    const entries: ShortcutEntry[] = [];
    const seen = new Set<string>();
    for (const binding of bindings) {
      const key = binding.key;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push({
        key,
        name: binding.name,
        description: binding.description,
      });
    }
    if (entries.length === 0) continue;

    groups.push({ title: prettifyPluginName(plugin.name), entries });
  }

  return groups;
}

function ShortcutKey({ keyString }: { keyString: string }) {
  const mac = isMac();
  const parts = splitKeyParts(keyString);
  return (
    <span className="inline-flex items-center gap-1">
      {parts.map((part, index) => (
        <kbd
          key={index}
          className="inline-flex min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground shadow-sm"
        >
          {formatKeyToken(part, mac)}
        </kbd>
      ))}
    </span>
  );
}

function ShortcutList({ entries }: { entries: ShortcutEntry[] }) {
  return (
    <ul className="flex flex-col divide-y divide-border/60">
      {entries.map((entry) => (
        <li
          key={entry.key}
          className="flex items-center justify-between gap-4 py-2 text-sm"
        >
          <div className="flex min-w-0 flex-col">
            <span className="text-foreground">{entry.name}</span>
            {entry.description && (
              <span className="text-xs text-muted-foreground">
                {entry.description}
              </span>
            )}
          </div>
          <ShortcutKey keyString={entry.key} />
        </li>
      ))}
    </ul>
  );
}

export function KeyboardShortcutsDialog() {
  const [open, setOpen] = useState(false);

  const pluginGroups = useMemo(() => {
    // Sort by descending entry count so masonry-style CSS columns end up
    // visually balanced regardless of which plugins contribute many vs. few
    // shortcuts.
    return [...discoverPluginShortcuts(allPlugins)].sort(
      (a, b) => b.entries.length - a.entries.length,
    );
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier || !event.shiftKey) return;
      // Mod-Shift-/ → "?" on most layouts
      if (event.key !== "?" && event.key !== "/") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA")
      ) {
        // still allow trigger from anywhere
      }
      event.preventDefault();
      setOpen((prev) => !prev);
    };
    const handleOpenEvent = () => setOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener(KEYBOARD_SHORTCUTS_EVENT, handleOpenEvent);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener(KEYBOARD_SHORTCUTS_EVENT, handleOpenEvent);
    };
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex flex-col gap-0 h-[90vh] md:h-[85vh] overflow-hidden p-0 w-[calc(100%-2rem)] sm:max-w-7xl">
        <DialogHeader className="p-6 border-b">
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <ShortcutKey keyString="Mod-Shift-/" /> any time to open this
            panel.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-full min-h-0">
          <div className="columns-1 gap-x-8 p-6 sm:columns-2 lg:columns-3">
            <section className="mb-8 break-inside-avoid">
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Interface
              </h3>
              <ShortcutList entries={interfaceShortcuts} />
            </section>
          </div>

          <div className="border-t">
            <h2 className="pt-4 px-6 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Editor shortcuts
            </h2>
            <p className="px-6 mt-1 mb-4 text-sm text-muted-foreground">
              These are the shortcuts to interact with the editor content. They
              are provided by the various plugins that power the editor
              features.
            </p>

            <div className="columns-1 gap-x-8 p-6 sm:columns-2 lg:columns-3">
              {pluginGroups.map((group) => (
                <section key={group.title} className="mb-8 break-inside-avoid">
                  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                    {group.title}
                  </h3>
                  <ShortcutList entries={group.entries} />
                </section>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

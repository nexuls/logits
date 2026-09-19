"use client";

import {
  CheckIcon,
  DownloadIcon,
  Share2Icon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import CircuitPreview from "@/components/preview/circuit-preview";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Example, examples } from "@/example";
import { lookupNode } from "@/lib/nodes/registry";
import { cn } from "@/lib/utils";
import type { CreateResult } from "@/state/projects-store";
import ExampleThumbnail from "./example-thumbnail";
import { copyExampleLink } from "./project-actions";
import { formatNodeCount } from "./projects";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Adds the example as a project. The dialog closes when it succeeds. */
  onImport: (example: Example) => CreateResult;
};

/** Parts only: a note or a group is not something the circuit is built from. */
const PART_COUNTS = new Map(
  examples.map((example) => [
    example.id,
    Object.values(example.document.nodes).filter(
      (node) => !lookupNode(node.type)?.decoration,
    ).length,
  ]),
);

/**
 * The shipped circuits as a gallery: pick one to run it beside the grid, then
 * import it as a project.
 *
 * The preview is a `CircuitPreview` — operable, never editable — so trying an
 * example changes nothing anywhere, and import always copies the example as
 * shipped. The split follows the window's shape: side by side when it is wide,
 * stacked when it is tall, so the canvas always gets the long axis.
 */
export default function ExamplesDialog({
  open,
  onOpenChange,
  onImport,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Every opening starts at the gallery — adjusted during render, so a stale
  // preview from last time never mounts and starts simulating.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedId(null);
      setError(null);
    }
  }

  const selected = examples.find((example) => example.id === selectedId);

  // Opening the preview narrows the gallery under the card that was clicked,
  // which can push it out of view.
  const listRef = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (!selectedId) return;
    listRef.current
      ?.querySelector(`[data-example-id="${selectedId}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  const importExample = (example: Example) => {
    const result = onImport(example);
    if (result.ok) {
      onOpenChange(false);
      return;
    }
    setError(result.error);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(92svh,56rem)] w-[min(96vw,90rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none">
        <DialogHeader className="border-b px-5 py-4 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <SparklesIcon aria-hidden className="size-4 text-primary" />
            Examples
          </DialogTitle>
          <DialogDescription>
            Circuits that ship with Logits. Pick one to try it out, then import
            it to get an editable copy in your projects.
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col landscape:flex-row">
          <div
            className={cn(
              "min-h-0 min-w-0 overflow-y-auto overscroll-contain",
              selected
                ? "h-2/5 shrink-0 border-b landscape:h-auto landscape:w-[min(38%,30rem)] landscape:border-r landscape:border-b-0"
                : "flex-1",
            )}
          >
            <ul
              ref={listRef}
              aria-label="Examples"
              className="grid grid-cols-[repeat(auto-fill,minmax(min(13rem,100%),1fr))] gap-3 p-4"
            >
              {examples.map((example) => {
                const isSelected = example.id === selectedId;
                return (
                  <li key={example.id} data-example-id={example.id}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      title="Double-click to import"
                      onClick={() => {
                        setSelectedId(example.id);
                        setError(null);
                      }}
                      onDoubleClick={() => importExample(example)}
                      className={cn(
                        "group/card flex size-full flex-col overflow-hidden rounded-xl border bg-card text-left transition-[border-color,box-shadow] outline-none",
                        "hover:border-foreground/25 focus-visible:ring-3 focus-visible:ring-ring/50",
                        isSelected &&
                          "border-primary ring-2 ring-primary/40 hover:border-primary",
                      )}
                    >
                      {/* The still is laid over the box rather than inside
                          it: a tall circuit's SVG would otherwise stretch
                          the box past its ratio and unbalance the row. */}
                      <div className="relative aspect-16/10 w-full border-b bg-background">
                        <div className="absolute inset-2">
                          <ExampleThumbnail document={example.document} />
                        </div>
                      </div>
                      <div className="flex flex-1 flex-col gap-1 p-3">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {example.name}
                          </span>
                          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                            {formatNodeCount(PART_COUNTS.get(example.id) ?? 0)}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {example.summary}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {selected && (
            <section
              aria-label={`Preview: ${selected.name}`}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium">{selected.name}</h3>
                  <p className="truncate text-xs text-muted-foreground">
                    Operate switches and keys to try it. Changes here are not
                    kept.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedId(null)}
                  >
                    <XIcon />
                    Close preview
                  </Button>
                  {/* Keyed, so the copied confirmation below does not carry
                      over to the next example the way the button would. */}
                  <ShareExampleButton
                    key={selected.id}
                    exampleId={selected.id}
                    onError={setError}
                  />
                  <Button size="sm" onClick={() => importExample(selected)}>
                    <DownloadIcon />
                    Import
                  </Button>
                </div>
                {error && (
                  <p role="alert" className="w-full text-xs text-destructive">
                    {error}
                  </p>
                )}
              </div>

              <div className="relative min-h-0 flex-1">
                {/* Keyed, so switching examples starts a fresh simulation
                    rather than carrying the last one's time and state. */}
                <CircuitPreview
                  key={selected.id}
                  document={selected.document}
                  showHeader={false}
                  showPerformanceMonitor={false}
                  autoPlay
                />
              </div>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ShareProps = {
  exampleId: string;
  /** The dialog's own error line, which sits right under this button. */
  onError: (message: string) => void;
};

/**
 * Copies the example's `/preview/example/<id>` link — the same link the
 * preview page's Share button offers, so a circuit picked here and one opened
 * from a link are shared as the same address.
 *
 * It confirms on itself rather than with a toast: the toast viewport is
 * portalled before the dialog and shares its `z-50`, so a toast raised from in
 * here comes up behind the overlay. A failure has the dialog's error line,
 * which is already directly below these buttons.
 */
function ShareExampleButton({ exampleId, onError }: ShareProps) {
  const [copied, setCopied] = useState(false);

  // One timer, restarted by each copy, as the editor's notice does it.
  useEffect(() => {
    if (!copied) return;
    const handle = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(handle);
  }, [copied]);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() =>
        copyExampleLink(exampleId).then((result) => {
          if (result.ok) setCopied(true);
          else onError(result.message);
        })
      }
    >
      {copied ? <CheckIcon /> : <Share2Icon />}
      {/* Announced, not just recoloured: the confirmation is the only thing
          that tells you the copy worked. */}
      <span aria-live="polite">{copied ? "Copied" : "Share"}</span>
    </Button>
  );
}

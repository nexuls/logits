"use client";

import { ChevronRightIcon, CornerLeftUpIcon, CpuIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { CircuitDocument } from "@/lib/circuit/schema";
import {
  closeAllSubcircuits,
  closeSubcircuit,
  openSubcircuit,
} from "@/state/document";

type Props = {
  /** The project the open chip belongs to, for the names along the trail. */
  project: CircuitDocument;
  /** Chip keys, outermost first. Never empty — the bar is not rendered at the root. */
  path: readonly string[];
  /** Instances of the open chip, anywhere in the project. */
  instances: number;
};

/**
 * The bar that says the canvas is showing one of the project's chips rather
 * than the project.
 *
 * The editor is otherwise identical inside a chip — same canvas, same palette,
 * same simulation — so something has to carry the mode, and it cannot be the
 * header title alone: a chip and a project would then look the same and only
 * read differently. It is a trail rather than one Back button because chips
 * nest, and the way out of three levels should not be three clicks in the same
 * place.
 *
 * It also states the instance count, which is the thing a user most needs
 * before editing a chip: a port renamed here changes every instance of it.
 */
export default function SubcircuitBreadcrumb({
  project,
  path,
  instances,
}: Props) {
  const nameOf = (key: string) => project.subcircuits?.[key]?.name ?? key;

  return (
    <div className="pointer-events-auto flex max-w-full items-center gap-1 rounded-md border border-primary/40 bg-sidebar px-1.5 py-1 shadow-chrome">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => closeSubcircuit()}
        aria-label="Leave this subcircuit"
        title="Leave this subcircuit"
      >
        <CornerLeftUpIcon />
      </Button>

      {/* A real list, so the trail is announced as one thing with a position
          in it rather than as a run of loose links. */}
      <nav aria-label="Subcircuit trail" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-0.5 text-[11px]">
          <li className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => closeAllSubcircuits()}
              className="max-w-28 truncate rounded px-1 py-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              {project.name}
            </button>
          </li>

          {path.map((key, index) => {
            const last = index === path.length - 1;
            return (
              <li key={key} className="flex min-w-0 items-center">
                <ChevronRightIcon
                  aria-hidden
                  className="size-3 shrink-0 text-muted-foreground/60"
                />
                {last ? (
                  // The open chip is where we are, so it is text with
                  // `aria-current` and not a link to here.
                  <span
                    aria-current="page"
                    className="flex min-w-0 items-center gap-1 px-1 py-0.5 font-medium"
                  >
                    <CpuIcon aria-hidden className="size-3 shrink-0" />
                    <span className="max-w-40 truncate">{nameOf(key)}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openSubcircuit(key)}
                    className="max-w-28 truncate rounded px-1 py-0.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  >
                    {nameOf(key)}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <span className="ml-1 shrink-0 border-l border-border pl-2 text-[11px] text-muted-foreground tabular-nums">
        {instances === 1 ? "1 instance" : `${instances} instances`}
      </span>
    </div>
  );
}

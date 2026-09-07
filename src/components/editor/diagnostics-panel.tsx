"use client";

import { AlertTriangleIcon, CheckCircle2Icon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Diagnostic } from "@/lib/circuit/netlist";
import { cn } from "@/lib/utils";
import { useDiagnostics } from "@/state/simulation";

type Props = {
  onClose: () => void;
  /** Selects and reveals the elements a diagnostic names. */
  onFocusElements: (
    nodeIds: readonly string[],
    wireIds: readonly string[],
  ) => void;
};

/**
 * Everything wrong with the circuit, from the netlist and from the run.
 *
 * Diagnostics are data, not exceptions — the netlist builds and the engine
 * runs regardless — so this is the place they become visible, and each entry
 * can select the elements it is about. That is the other half of the rule that
 * errors are never signalled by colour alone: a red wire is also a row here,
 * with a sentence saying what is wrong with it.
 */
export default function DiagnosticsPanel({ onClose, onFocusElements }: Props) {
  const diagnostics = useDiagnostics();

  return (
    <div className="pointer-events-auto absolute right-2 bottom-2 z-20 flex max-h-64 w-96 max-w-[calc(100%-1rem)] flex-col rounded-lg border border-border bg-sidebar shadow-lg">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="flex-1 text-xs font-semibold">
          Diagnostics
          {diagnostics.length > 0 && (
            <span className="ml-1 text-muted-foreground">
              ({diagnostics.length})
            </span>
          )}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close diagnostics"
        >
          <XIcon />
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {diagnostics.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-3 text-xs text-muted-foreground">
            <CheckCircle2Icon className="size-4" aria-hidden />
            No problems found.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {diagnostics.map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${index}`}>
                <Row
                  diagnostic={diagnostic}
                  onFocus={() =>
                    onFocusElements(
                      diagnostic.nodeIds ?? [],
                      diagnostic.wireIds ?? [],
                    )
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Row({
  diagnostic,
  onFocus,
}: {
  diagnostic: Diagnostic;
  onFocus: () => void;
}) {
  const focusable =
    (diagnostic.nodeIds?.length ?? 0) + (diagnostic.wireIds?.length ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={onFocus}
      disabled={!focusable}
      className={cn(
        "flex w-full gap-2 rounded-md px-2 py-1.5 text-left text-xs",
        focusable ? "hover:bg-muted" : "cursor-default",
      )}
    >
      <AlertTriangleIcon
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          diagnostic.severity === "error"
            ? "text-destructive"
            : "text-muted-foreground",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="font-mono text-[10px] text-muted-foreground">
          {diagnostic.severity} · {diagnostic.code}
        </span>
        <span className="block break-words">{diagnostic.message}</span>
      </span>
    </button>
  );
}

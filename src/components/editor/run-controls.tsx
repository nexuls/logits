"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  DownloadIcon,
  PauseIcon,
  PlayIcon,
  RedoIcon,
  RotateCcwIcon,
  SaveIcon,
  SkipForwardIcon,
  UndoIcon,
  UploadIcon,
} from "lucide-react";
import type { ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatSimTime } from "@/lib/sim/time";
import { cn } from "@/lib/utils";
import {
  flushSave,
  redo,
  undo,
  useDocument,
  useHistoryState,
  useSaveState,
} from "@/state/document";
import {
  pause,
  play,
  resetSimulation,
  setSimulationSpeed,
  stepSimulation,
  useSimulationStatus,
} from "@/state/simulation";

type Props = {
  diagnosticsOpen: boolean;
  onToggleDiagnostics: () => void;
  performanceOpen: boolean;
  onTogglePerformance: () => void;
  /** Shared with the header menu, so the two cannot import differently. */
  onImport: () => void;
  onExport: () => void;
  onNotice: (message: string) => void;
};

/**
 * The floating toolbar: run controls, history, persistence, diagnostics, and
 * the switch that opens the performance monitor out into its detailed view.
 *
 * It reads the simulation through `useSimulationStatus`, which is one
 * subscription for the whole bar rather than one per button — the runner
 * notifies once a frame and this is a coarse consumer, unlike a LED.
 */

/** Simulated nanoseconds per real second. */
const SPEEDS = [
  { value: 100, label: "0.1 µs/s" },
  { value: 1_000, label: "1 µs/s" },
  { value: 10_000, label: "10 µs/s" },
  { value: 100_000, label: "100 µs/s" },
  { value: 1_000_000, label: "1 ms/s" },
];

export default function RunControls({
  diagnosticsOpen,
  onToggleDiagnostics,
  performanceOpen,
  onTogglePerformance,
  onImport,
  onExport,
  onNotice,
}: Props) {
  const document = useDocument();
  const status = useSimulationStatus();
  const { canUndo, canRedo } = useHistoryState();
  const save = useSaveState();

  const running = status.mode === "running";
  const problems = status.errorCount + status.warningCount;
  const speedLabel =
    SPEEDS.find((speed) => speed.value === status.speedNsPerSecond)?.label ??
    "Custom";

  return (
    <div className="pointer-events-auto absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-sidebar px-1.5 py-1 shadow-chrome border border-border">
      <ToolbarTooltip label={running ? "Pause" : "Run"} shortcut="Space">
        <Button
          type="button"
          variant={running ? "secondary" : "ghost"}
          size="icon"
          disabled={!status.ready}
          onClick={() => (running ? pause() : play())}
          aria-label={running ? "Pause simulation" : "Run simulation"}
          aria-pressed={running}
          aria-keyshortcuts="Space"
        >
          {running ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </ToolbarTooltip>

      <ToolbarTooltip label="Step one event" shortcut=".">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!status.ready}
          onClick={stepSimulation}
          aria-label="Step one event"
          aria-keyshortcuts="."
        >
          <SkipForwardIcon />
        </Button>
      </ToolbarTooltip>

      <ToolbarTooltip label="Reset simulation">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!status.ready}
          onClick={resetSimulation}
          aria-label="Reset simulation"
        >
          <RotateCcwIcon />
        </Button>
      </ToolbarTooltip>

      <DropdownMenu>
        <ToolbarTooltip label="Simulation speed">
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Simulation speed: ${speedLabel}`}
                className="ml-1 font-mono text-xs tabular-nums"
              >
                {speedLabel}
                <ChevronDownIcon className="text-muted-foreground" />
              </Button>
            }
          />
        </ToolbarTooltip>
        <DropdownMenuContent align="start" className="w-36">
          <DropdownMenuRadioGroup
            value={status.speedNsPerSecond}
            onValueChange={(value) => setSimulationSpeed(Number(value))}
          >
            {SPEEDS.map((speed) => (
              <DropdownMenuRadioItem
                key={speed.value}
                value={speed.value}
                className="font-mono text-xs tabular-nums"
              >
                {speed.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <span
        className="ml-1 w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
        // Simulated time changes every frame while running; announcing it
        // would make a screen reader unusable.
        aria-hidden
      >
        {formatSimTime(status.time)}
      </span>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarTooltip label="Undo" shortcut="⌘Z">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={() => undo()}
          aria-label="Undo"
          aria-keyshortcuts="Control+Z Meta+Z"
        >
          <UndoIcon />
        </Button>
      </ToolbarTooltip>
      <ToolbarTooltip label="Redo" shortcut="⌘⇧Z">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={() => redo()}
          aria-label="Redo"
          aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
        >
          <RedoIcon />
        </Button>
      </ToolbarTooltip>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarTooltip
        label={save.error ?? (save.pending ? "Save (unsaved changes)" : "Save")}
        shortcut="⌘S"
      >
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!document}
          onClick={() => {
            flushSave();
            onNotice(save.error ?? "Saved.");
          }}
          aria-label={save.pending ? "Save (unsaved changes)" : "Save"}
          aria-keyshortcuts="Control+S Meta+S"
          className={cn(save.error && "text-destructive")}
        >
          <SaveIcon />
        </Button>
      </ToolbarTooltip>

      <ToolbarTooltip label="Export as JSON">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!document}
          onClick={onExport}
          aria-label="Export as JSON"
        >
          <DownloadIcon />
        </Button>
      </ToolbarTooltip>

      <ToolbarTooltip label="Import a circuit file">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onImport}
          aria-label="Import a circuit file"
        >
          <UploadIcon />
        </Button>
      </ToolbarTooltip>
      <Separator orientation="vertical" className="mx-1 h-6" />

      <ToolbarTooltip label="Performance details">
        <Button
          type="button"
          variant={performanceOpen ? "secondary" : "ghost"}
          size="icon"
          onClick={onTogglePerformance}
          aria-pressed={performanceOpen}
          aria-label="Performance details"
        >
          <ActivityIcon />
        </Button>
      </ToolbarTooltip>

      <ToolbarTooltip
        label={`${status.errorCount} errors, ${status.warningCount} warnings`}
      >
        <Button
          type="button"
          variant={diagnosticsOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={onToggleDiagnostics}
          aria-pressed={diagnosticsOpen}
          aria-label={`Diagnostics: ${status.errorCount} errors, ${status.warningCount} warnings`}
          className={cn(status.errorCount > 0 && "text-destructive")}
        >
          <AlertTriangleIcon />
          {problems > 0 ? problems : "OK"}
        </Button>
      </ToolbarTooltip>
    </div>
  );
}

/**
 * Below the bar rather than the default above it: the bar sits at the top of
 * the canvas, so a tooltip on top would be clipped by the viewport edge.
 */
function ToolbarTooltip({
  label,
  shortcut,
  children,
}: {
  label: string;
  shortcut?: string;
  children: ReactElement;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="bottom">
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

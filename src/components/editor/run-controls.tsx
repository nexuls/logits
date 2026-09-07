"use client";

import {
  AlertTriangleIcon,
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
import { type ChangeEvent, useRef } from "react";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { deserialize, FILE_EXTENSION, serialize } from "@/lib/circuit/io";
import { cn } from "@/lib/utils";
import {
  flushSave,
  redo,
  setDocument,
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
  onNotice: (message: string) => void;
};

/**
 * The floating toolbar: run controls, history, persistence, diagnostics.
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
  onNotice,
}: Props) {
  const document = useDocument();
  const status = useSimulationStatus();
  const { canUndo, canRedo } = useHistoryState();
  const save = useSaveState();
  const fileRef = useRef<HTMLInputElement>(null);

  const running = status.mode === "running";
  const problems = status.errorCount + status.warningCount;

  const onImport = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset first: picking the same file twice must fire `change` both times.
    event.target.value = "";
    if (!file) return;

    file
      .text()
      .then((text) => {
        const result = deserialize(text);
        if (!result.ok) {
          onNotice(result.issues[0]?.message ?? "That file is not a circuit.");
          return;
        }
        setDocument(result.document);
        onNotice(
          result.issues.length > 0
            ? `Imported with ${result.issues.length} issue(s).`
            : `Imported “${result.document.name}”.`,
        );
      })
      .catch(() => onNotice("That file could not be read."));
  };

  const onExport = () => {
    if (!document) return;

    const blob = new Blob([serialize(document)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement("a");
    link.href = url;
    link.download = `${document.name}${FILE_EXTENSION}`;
    link.click();
    // Revoked on the next tick rather than immediately: Safari has not started
    // the download by the time `click()` returns.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  return (
    <div className="pointer-events-auto absolute top-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-lg bg-sidebar px-1.5 py-1 shadow-sm">
      <Button
        type="button"
        variant={running ? "secondary" : "ghost"}
        size="icon"
        disabled={!status.ready}
        onClick={() => (running ? pause() : play())}
        aria-label={running ? "Pause simulation" : "Run simulation"}
        aria-pressed={running}
      >
        {running ? <PauseIcon /> : <PlayIcon />}
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!status.ready}
        onClick={stepSimulation}
        aria-label="Step one event"
      >
        <SkipForwardIcon />
      </Button>

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

      <NativeSelect
        size="sm"
        aria-label="Simulation speed"
        value={String(status.speedNsPerSecond)}
        onChange={(event) => setSimulationSpeed(Number(event.target.value))}
        className="ml-1"
      >
        {SPEEDS.map((speed) => (
          <option key={speed.value} value={speed.value}>
            {speed.label}
          </option>
        ))}
      </NativeSelect>

      <span
        className="ml-1 w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
        // Simulated time changes every frame while running; announcing it
        // would make a screen reader unusable.
        aria-hidden
      >
        {formatTime(status.time)}
      </span>

      <Separator orientation="vertical" className="mx-1 h-6" />

      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canUndo}
        onClick={() => undo()}
        aria-label="Undo"
      >
        <UndoIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={!canRedo}
        onClick={() => redo()}
        aria-label="Redo"
      >
        <RedoIcon />
      </Button>

      <Separator orientation="vertical" className="mx-1 h-6" />

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
        className={cn(save.error && "text-destructive")}
      >
        <SaveIcon />
      </Button>

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

      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => fileRef.current?.click()}
        aria-label="Import a circuit file"
      >
        <UploadIcon />
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        onChange={onImport}
        className="hidden"
        // Not `aria-hidden`: the button above is the label for it, and hiding
        // it from the tree would leave that button pointing at nothing.
        tabIndex={-1}
      />

      <Separator orientation="vertical" className="mx-1 h-6" />

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
    </div>
  );
}

/** Simulated nanoseconds, in the largest unit that keeps the number small. */
function formatTime(ns: number): string {
  if (ns < 1_000) return `${ns} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(2)} µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(2)} ms`;
  return `${(ns / 1_000_000_000).toFixed(2)} s`;
}

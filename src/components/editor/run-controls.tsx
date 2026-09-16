"use client";

import {
  DownloadIcon,
  RedoIcon,
  SaveIcon,
  UndoIcon,
  UploadIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  flushSave,
  redo,
  undo,
  useDocument,
  useHistoryState,
  useSaveState,
} from "@/state/document";
import SimulationControls, {
  DiagnosticsToggle,
  PerformanceToggle,
  Toolbar,
  ToolbarSeparator,
  ToolbarTooltip,
} from "./simulation-controls";

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
 * The editor's floating toolbar: run controls, history, persistence,
 * diagnostics, and the switch that opens the performance monitor out into its
 * detailed view.
 *
 * The simulation half is `SimulationControls`, shared with the read-only
 * preview; what is here is the half that edits or saves a document.
 */
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
  const { canUndo, canRedo } = useHistoryState();
  const save = useSaveState();

  return (
    <Toolbar>
      <SimulationControls />

      <ToolbarSeparator />

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

      <ToolbarSeparator />

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
      <ToolbarSeparator />

      <PerformanceToggle
        pressed={performanceOpen}
        onToggle={onTogglePerformance}
      />
      <DiagnosticsToggle
        pressed={diagnosticsOpen}
        onToggle={onToggleDiagnostics}
      />
    </Toolbar>
  );
}

"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from "lucide-react";
import type { ReactElement, ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatSimTime } from "@/lib/sim/time";
import { cn } from "@/lib/utils";
import { useSimulation, useSimulationStatus } from "@/state/simulation";

type Props = {
  showStep?: boolean;
  showReset?: boolean;
  showSpeed?: boolean;
  /** The simulated-time readout. */
  showTime?: boolean;
  /** Keyboard hints in the tooltips — off where nothing binds the keys. */
  showShortcuts?: boolean;
};

/** Simulated nanoseconds per real second. */
export const SIMULATION_SPEEDS = [
  { value: 100, label: "0.1 µs/s" },
  { value: 1_000, label: "1 µs/s" },
  { value: 10_000, label: "10 µs/s" },
  { value: 100_000, label: "100 µs/s" },
  { value: 1_000_000, label: "1 ms/s" },
];

/**
 * Run, step, reset, speed and the clock: the part of the toolbar that drives a
 * simulation and never touches a document, shared by the editor and the
 * preview.
 *
 * It drives whichever simulation the nearest `SimulationContext` provides, and
 * reads it through `useSimulationStatus` — one subscription for the group
 * rather than one per button, since the runner notifies once a frame and this
 * is a coarse consumer, unlike a LED.
 */
export default function SimulationControls({
  showStep = true,
  showReset = true,
  showSpeed = true,
  showTime = true,
  showShortcuts = true,
}: Props) {
  const simulation = useSimulation();
  const status = useSimulationStatus();

  const running = status.mode === "running";
  const speedLabel =
    SIMULATION_SPEEDS.find((speed) => speed.value === status.speedNsPerSecond)
      ?.label ?? "Custom";

  return (
    <>
      <ToolbarTooltip
        label={running ? "Pause" : "Run"}
        shortcut={showShortcuts ? "Space" : undefined}
      >
        <Button
          type="button"
          variant={running ? "secondary" : "ghost"}
          size="icon"
          disabled={!status.ready}
          onClick={() => (running ? simulation.pause() : simulation.play())}
          aria-label={running ? "Pause simulation" : "Run simulation"}
          aria-pressed={running}
          aria-keyshortcuts={showShortcuts ? "Space" : undefined}
        >
          {running ? <PauseIcon /> : <PlayIcon />}
        </Button>
      </ToolbarTooltip>

      {showStep && (
        <ToolbarTooltip
          label="Step one event"
          shortcut={showShortcuts ? "." : undefined}
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!status.ready}
            onClick={simulation.step}
            aria-label="Step one event"
            aria-keyshortcuts={showShortcuts ? "." : undefined}
          >
            <SkipForwardIcon />
          </Button>
        </ToolbarTooltip>
      )}

      {showReset && (
        <ToolbarTooltip label="Reset simulation">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={!status.ready}
            onClick={simulation.reset}
            aria-label="Reset simulation"
          >
            <RotateCcwIcon />
          </Button>
        </ToolbarTooltip>
      )}

      {showSpeed && (
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
              onValueChange={(value) => simulation.setSpeed(Number(value))}
            >
              {SIMULATION_SPEEDS.map((speed) => (
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
      )}

      {showTime && (
        <span
          className="ml-1 w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground"
          // Simulated time changes every frame while running; announcing it
          // would make a screen reader unusable.
          aria-hidden
        >
          {formatSimTime(status.time)}
        </span>
      )}
    </>
  );
}

/** The floating bar itself, centred at the top of the canvas. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-auto absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-lg bg-sidebar px-1.5 py-1 shadow-chrome border border-border",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Opens the performance monitor out into its detailed view. */
export function PerformanceToggle({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <ToolbarTooltip label="Performance details">
      <Button
        type="button"
        variant={pressed ? "secondary" : "ghost"}
        size="icon"
        onClick={onToggle}
        aria-pressed={pressed}
        aria-label="Performance details"
      >
        <ActivityIcon />
      </Button>
    </ToolbarTooltip>
  );
}

/** The problem count, which opens the diagnostics panel. */
export function DiagnosticsToggle({
  pressed,
  onToggle,
}: {
  pressed: boolean;
  onToggle: () => void;
}) {
  const { errorCount, warningCount } = useSimulationStatus();
  const problems = errorCount + warningCount;

  return (
    <ToolbarTooltip label={`${errorCount} errors, ${warningCount} warnings`}>
      <Button
        type="button"
        variant={pressed ? "secondary" : "ghost"}
        size="sm"
        onClick={onToggle}
        aria-pressed={pressed}
        aria-label={`Diagnostics: ${errorCount} errors, ${warningCount} warnings`}
        className={cn(errorCount > 0 && "text-destructive")}
      >
        <AlertTriangleIcon />
        {problems > 0 ? problems : "OK"}
      </Button>
    </ToolbarTooltip>
  );
}

/**
 * Below the bar rather than the default above it: the bar sits at the top of
 * the canvas, so a tooltip on top would be clipped by the viewport edge.
 */
export function ToolbarTooltip({
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

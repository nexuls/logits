"use client";

import {
  ActivityIcon,
  AlertTriangleIcon,
  ChevronDownIcon,
  GaugeIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SkipForwardIcon,
} from "lucide-react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

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
                  // One icon wide in the rail, like everything else there: the
                  // label is the widest thing in the bar and would set the
                  // width of the whole rail. The value is still in the
                  // tooltip, in `aria-label`, and checked in the menu itself.
                  className="ml-1 font-mono text-xs tabular-nums @max-[64rem]/canvas:ml-0 @max-[64rem]/canvas:h-8! @max-[64rem]/canvas:w-8! @max-[64rem]/canvas:justify-center @max-[64rem]/canvas:px-0!"
                >
                  <GaugeIcon className="hidden @max-[64rem]/canvas:block" />
                  <span className="@max-[64rem]/canvas:hidden">
                    {speedLabel}
                  </span>
                  <ChevronDownIcon className="text-muted-foreground @max-[64rem]/canvas:hidden" />
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
          // Only while the bar is horizontal. It is decorative (already
          // `aria-hidden`) and 5rem wide, which in the rail would set the
          // width of the whole thing for a readout nothing depends on.
          className="ml-1 hidden w-20 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground @min-[64rem]/canvas:inline"
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

/**
 * Which way the surrounding bar is laid out, for the things inside it that
 * cannot be told in CSS — the tooltips, whose `side` is a render-time prop.
 * `horizontal` is the default, so a `ToolbarTooltip` used on its own (the
 * share button) still points the way it always did.
 */
const ToolbarOrientation = createContext<"horizontal" | "vertical">(
  "horizontal",
);

/** The floating bar itself, centred at the top of the canvas. */
export function Toolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">(
    "horizontal",
  );

  // Read back off the element rather than matched against 64rem again here:
  // the container query below owns when the bar turns, and a second copy of
  // that number in JS is one that can drift from it. The observer fires on
  // the turn because the bar's own size changes with it.
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    const read = () =>
      setOrientation(
        getComputedStyle(bar).flexDirection === "column"
          ? "vertical"
          : "horizontal",
      );

    read();
    const observer = new ResizeObserver(read);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  return (
    <ToolbarOrientation value={orientation}>
      <div
        ref={barRef}
        className={cn(
          "pointer-events-auto absolute top-2 left-1/2 z-20 flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-lg bg-sidebar px-1.5 py-1 shadow-chrome border border-border",
          // The bar is ~26rem of buttons, which no longer fits across the top of
          // a narrow canvas beside the header and the share / elements buttons.
          // Below 64rem it turns on its side and becomes a rail down the right
          // edge, where the canvas has height to spare and nothing else sits.
          "@max-[64rem]/canvas:top-14 @max-[64rem]/canvas:bottom-14 @max-[64rem]/canvas:left-auto @max-[64rem]/canvas:right-2 @max-[64rem]/canvas:translate-x-0 @max-[64rem]/canvas:flex-col @max-[64rem]/canvas:max-w-none",
          // Centred in the band between the top row and the bottom chrome, and
          // capped to it: `h-fit` with both insets and `my-auto` centres the
          // rail, `max-h` keeps a tall one from running past the band. The
          // bottom inset is what keeps it off the status bar and the minimap,
          // so those two can stay flush in their corners.
          "@max-[64rem]/canvas:my-auto @max-[64rem]/canvas:h-fit @max-[64rem]/canvas:max-h-[calc(100%-7rem)] @max-[64rem]/canvas:overflow-y-auto",
          // Narrower (or shorter) than its contents it scrolls rather than
          // bursting its box or squashing the buttons into slivers.
          "overflow-x-auto *:shrink-0",
          className,
        )}
      >
        {children}
      </div>
    </ToolbarOrientation>
  );
}

/**
 * The rule between groups of buttons. It follows the bar's own direction — a
 * vertical rule across the top, a horizontal one once the bar has turned into
 * the right-edge rail. `orientation` is fixed at render, so the turn is done
 * in CSS, and these need `!` to beat the primitive's own `data-vertical:`
 * sizing, which is a variant and would otherwise win.
 */
export function ToolbarSeparator() {
  return (
    <Separator
      orientation="vertical"
      className="mx-1 h-6 @max-[64rem]/canvas:mx-auto @max-[64rem]/canvas:my-1 @max-[64rem]/canvas:h-px! @max-[64rem]/canvas:w-6! @max-[64rem]/canvas:self-center"
    />
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
        // Follows the monitor itself, which has no room below 48rem of canvas.
        className="@max-[48rem]/canvas:hidden"
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
        className={cn(
          errorCount > 0 && "text-destructive",
          // Icon only in the rail. The count is still in the tooltip and in
          // `aria-label`, and an error still colours the icon.
          "@max-[64rem]/canvas:h-8! @max-[64rem]/canvas:w-8! @max-[64rem]/canvas:justify-center @max-[64rem]/canvas:px-0!",
        )}
      >
        <AlertTriangleIcon />
        <span className="@max-[64rem]/canvas:hidden">
          {problems > 0 ? problems : "OK"}
        </span>
      </Button>
    </ToolbarTooltip>
  );
}

/**
 * Always pointed into the canvas, away from the edge the bar is against:
 * below it across the top, where a tooltip above would be clipped by the
 * viewport edge, and to its left once the bar is the right-edge rail, where
 * one below would sit over the next button down.
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
  const orientation = useContext(ToolbarOrientation);

  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side={orientation === "vertical" ? "left" : "bottom"}>
        {label}
        {shortcut && <Kbd>{shortcut}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

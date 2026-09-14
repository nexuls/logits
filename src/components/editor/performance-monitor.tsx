"use client";

import { AlertTriangleIcon, ChevronUpIcon } from "lucide-react";
import { type PointerEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatSimTime } from "@/lib/sim/time";
import { cn } from "@/lib/utils";
import {
  HISTORY_LENGTH,
  type PerformanceSnapshot,
  PUBLISH_MS,
  usePerformanceSnapshot,
} from "@/state/performance";

type Props = {
  expanded: boolean;
  onToggle: () => void;
};

/** Below this the canvas visibly stutters. */
const LOW_FPS = 30;
/** Three frames at 60 Hz: input that waits longer than this feels laggy. */
const HIGH_LATENCY_MS = 50;
/** The simulation is falling behind the requested speed. */
const LAGGING_SPEED_PERCENT = 90;

/**
 * The performance monitor, mirroring the minimap in the opposite corner.
 *
 * One element in two states rather than two components: collapsed it is a
 * single status line, and expanding grows the same box upward and wider with
 * the details, so the line the user was reading stays where it was and becomes
 * the footer of the detailed view.
 *
 * The numbers change twice a second, so nothing here is a live region — a
 * screen reader would announce nothing else. The detailed view's lists are the
 * text form of every sparkline.
 */
export default function PerformanceMonitor({ expanded, onToggle }: Props) {
  const snapshot = usePerformanceSnapshot();
  const detailsId = useId();

  return (
    <section
      aria-label="Performance monitor"
      className={cn(
        "pointer-events-auto flex max-w-full shrink-0 flex-col overflow-hidden bg-sidebar border-t border-l border-border shadow-chrome",
        "transition-[width,border-radius] duration-300 ease-out motion-reduce:transition-none",
        expanded ? "w-120 rounded-tl-xl" : "w-104 rounded-tl-lg",
      )}
    >
      <div
        id={detailsId}
        // Collapsed content is still in the DOM so it can animate; `inert`
        // keeps it out of the tab order and the accessibility tree meanwhile.
        inert={!expanded}
        className={cn(
          "grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none",
          expanded
            ? "grid-rows-[1fr] opacity-100"
            : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          {/* Laid out at the expanded width throughout, so collapsing clips
              the details rather than reflowing them as the box narrows. */}
          <div className="max-h-[min(34rem,calc(100dvh-9rem))] w-120 max-w-[100vw] overflow-y-auto border-b border-border p-3">
            <Details snapshot={snapshot} />
          </div>
        </div>
      </div>

      <StatusLine
        snapshot={snapshot}
        expanded={expanded}
        detailsId={detailsId}
        onToggle={onToggle}
      />
    </section>
  );
}

function StatusLine({
  snapshot,
  expanded,
  detailsId,
  onToggle,
}: {
  snapshot: PerformanceSnapshot;
  expanded: boolean;
  detailsId: string;
  onToggle: () => void;
}) {
  const { sampled, sim, latencyMs } = snapshot;

  let simValue = "—";
  if (sampled && !sim.ready) simValue = "idle";
  else if (sampled && sim.speedPercent === null) simValue = "paused";
  else if (sim.speedPercent !== null)
    simValue = formatPercent(sim.speedPercent);

  return (
    <div className="flex h-10 items-center gap-2 px-3">
      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 overflow-hidden">
        <Metric
          label="FPS"
          title="Canvas frames per second"
          value={sampled ? formatInteger(snapshot.fps) : "—"}
          width="w-[3ch]"
          warning={
            sampled && snapshot.fps < LOW_FPS ? "Low frame rate" : undefined
          }
        />
        <Metric
          label="TPS"
          title="Simulation ticks (events) processed per second"
          value={sampled ? formatCount(sim.eventsPerSecond) : "—"}
          width="w-[5ch]"
        />
        <Metric
          label="LAT"
          title="Input latency: time from input to the next frame"
          value={latencyMs ? formatMs(latencyMs.avg) : "—"}
          width="w-[7ch]"
          // Judged on the number shown: a red "12 ms" warned by a p95 the
          // line does not display would read as a bug in the monitor.
          warning={
            latencyMs && latencyMs.avg > HIGH_LATENCY_MS
              ? "High input latency"
              : undefined
          }
        />
        <Metric
          label="SIM"
          title="Simulation speed achieved, as a share of the speed requested"
          value={simValue}
          width="w-[6ch]"
          warning={
            sim.speedPercent !== null &&
            sim.speedPercent < LAGGING_SPEED_PERCENT
              ? "Simulation is falling behind the requested speed"
              : undefined
          }
        />
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={
          expanded ? "Hide performance details" : "Show performance details"
        }
      >
        <ChevronUpIcon
          className={cn(
            "transition-transform duration-300 motion-reduce:transition-none",
            expanded && "rotate-180",
          )}
        />
      </Button>
    </div>
  );
}

function Metric({
  label,
  title,
  value,
  width,
  warning,
}: {
  label: string;
  title: string;
  value: string;
  /** Fixed, so a value gaining a digit does not shuffle the line. */
  width: string;
  warning?: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1" title={title}>
      <span className="text-[10px] font-medium tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-right font-mono text-xs tabular-nums",
          width,
          warning && "text-destructive",
        )}
      >
        {value}
      </span>
      {/* An icon as well as the colour, so a warning is never colour alone;
          the slot is always reserved so the line does not jump. */}
      <span className="flex size-3 items-center">
        {warning && (
          <AlertTriangleIcon
            role="img"
            aria-label={warning}
            className="size-3 text-destructive"
          />
        )}
      </span>
    </div>
  );
}

function Details({ snapshot }: { snapshot: PerformanceSnapshot }) {
  const { sim, latencyMs, history } = snapshot;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold">Performance</h2>
        <p className="text-[10px] text-muted-foreground">
          every {PUBLISH_MS / 1000} s · last{" "}
          {(HISTORY_LENGTH * PUBLISH_MS) / 1000} s
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <TrendCard
          title="Frame rate"
          values={history.fps}
          format={(value) => `${formatInteger(value)} fps`}
        />
        <TrendCard
          title="Ticks per second"
          values={history.tps}
          format={(value) => `${formatCount(value)}/s`}
        />
        <TrendCard
          title="Input latency"
          values={history.latency}
          format={formatMs}
        />
        <TrendCard
          title="Engine time per frame"
          values={history.cost}
          format={formatMs}
        />
      </div>

      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        <StatList
          title="Rendering"
          rows={[
            ["Frame rate", `${formatInteger(snapshot.fps)} fps`],
            ["1% low", `${formatInteger(snapshot.lowFps)} fps`],
            ["Frame time", formatMs(snapshot.frameMs.avg)],
            ["Frame time p95", formatMs(snapshot.frameMs.p95)],
            ["Worst frame", formatMs(snapshot.frameMs.max)],
            ["Dropped frames", formatPercent(snapshot.droppedPercent)],
            ["Display refresh", `${formatInteger(snapshot.refreshHz)} Hz`],
            [
              "Long tasks (10 s)",
              snapshot.longTasks
                ? `${snapshot.longTasks.count} · ${formatMs(snapshot.longTasks.totalMs)}`
                : "not reported",
            ],
            [
              "JS heap",
              snapshot.heapMb
                ? `${formatInteger(snapshot.heapMb.used)} / ${formatInteger(snapshot.heapMb.limit)} MB`
                : "not reported",
            ],
          ]}
        />

        <div className="space-y-3">
          <StatList
            title="Input"
            rows={[
              ["Latency, last", latencyMs ? formatMs(latencyMs.last) : "—"],
              ["Latency, average", latencyMs ? formatMs(latencyMs.avg) : "—"],
              ["Latency p95", latencyMs ? formatMs(latencyMs.p95) : "—"],
              ["Worst latency", latencyMs ? formatMs(latencyMs.max) : "—"],
              ["Samples", latencyMs ? String(latencyMs.samples) : "0"],
            ]}
          />

          <StatList
            title="Circuit"
            rows={[
              ["Nodes", formatCount(sim.nodes)],
              ["Nets", formatCount(sim.nets)],
            ]}
          />
        </div>

        <div className="sm:col-span-2">
          <StatList
            title="Simulation"
            wide
            rows={[
              [
                "State",
                !sim.ready ? "No circuit" : sim.running ? "Running" : "Paused",
              ],
              ["Ticks per second", formatCount(sim.eventsPerSecond)],
              ["Frames per second", formatInteger(sim.framesPerSecond)],
              ["Ticks per frame", formatCount(sim.eventsPerFrame)],
              ["Requested speed", `${formatSimTime(sim.targetNsPerSecond)}/s`],
              [
                "Achieved speed",
                `${formatSimTime(Math.round(sim.achievedNsPerSecond))}/s`,
              ],
              [
                "Keeping up",
                sim.speedPercent === null
                  ? "—"
                  : formatPercent(sim.speedPercent),
              ],
              [
                "Engine time / frame",
                sim.costMs
                  ? `${formatMs(sim.costMs.avg)} · max ${formatMs(sim.costMs.max)}`
                  : "—",
              ],
              ["Budget-limited frames", formatPercent(sim.saturatedPercent)],
              ["Queued events", formatCount(sim.pendingEvents)],
              ["Simulated time", formatSimTime(sim.timeNs)],
            ]}
          />
        </div>
      </div>
    </div>
  );
}

function StatList({
  title,
  rows,
  wide = false,
}: {
  title: string;
  rows: readonly (readonly [string, string])[];
  /** Two label/value pairs per line, for a list given the full panel width. */
  wide?: boolean;
}) {
  return (
    <section>
      <h3 className="mb-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </h3>
      <dl
        className={cn(
          "grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-[11px]",
          wide && "sm:grid-cols-[1fr_auto_1fr_auto] sm:gap-x-4",
        )}
      >
        {rows.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="truncate text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const SPARK_HEIGHT = 32;

function TrendCard({
  title,
  values,
  format,
}: {
  title: string;
  values: readonly number[];
  format: (value: number) => string;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const finite = values.filter(Number.isFinite);
  const current = finite.at(-1);
  const summary =
    finite.length > 0
      ? {
          min: Math.min(...finite),
          avg: finite.reduce((sum, value) => sum + value, 0) / finite.length,
          max: Math.max(...finite),
        }
      : null;

  const hoveredValue = hovered === null ? undefined : values[hovered];
  const hoveredAgo =
    hovered === null ? 0 : ((values.length - 1 - hovered) * PUBLISH_MS) / 1000;

  // Right-aligned: the newest sample always sits at the right edge, so the
  // line grows in from the right as history fills instead of stretching.
  const offset = HISTORY_LENGTH - values.length;
  const top = (summary?.max ?? 0) * 1.15 || 1;
  const xPercent = (index: number) =>
    ((offset + index) / (HISTORY_LENGTH - 1)) * 100;
  const yOf = (value: number) =>
    SPARK_HEIGHT - 1 - (value / top) * (SPARK_HEIGHT - 2);

  let path = "";
  let pen = false;
  values.forEach((value, index) => {
    if (!Number.isFinite(value)) {
      // A gap is drawn as a gap — an interval with no input has no latency,
      // and joining across it would invent a trend.
      pen = false;
      return;
    }
    path += `${pen ? "L" : "M"}${xPercent(index)} ${yOf(value)}`;
    pen = true;
  });

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const slot = Math.round(
      ((event.clientX - rect.left) / rect.width) * (HISTORY_LENGTH - 1),
    );
    const index = Math.min(values.length - 1, slot - offset);
    setHovered(index >= 0 ? index : null);
  };

  return (
    <div className="rounded-md border border-border p-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-medium text-muted-foreground">
          {title}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums">
          {hoveredValue !== undefined
            ? Number.isFinite(hoveredValue)
              ? format(hoveredValue)
              : "—"
            : current !== undefined
              ? format(current)
              : "—"}
        </span>
      </div>
      <p className="h-3 text-[9px] text-muted-foreground" aria-hidden>
        {hovered !== null
          ? hoveredAgo === 0
            ? "now"
            : `${hoveredAgo} s ago`
          : ""}
      </p>

      <div
        className="relative mt-0.5"
        style={{ height: SPARK_HEIGHT }}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHovered(null)}
      >
        <svg
          role="img"
          aria-label={
            summary
              ? `${title}: now ${current !== undefined ? format(current) : "—"}, range ${format(summary.min)} to ${format(summary.max)}`
              : `${title}: no data yet`
          }
          viewBox={`0 0 100 ${SPARK_HEIGHT}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <line
            x1={0}
            x2={100}
            y1={SPARK_HEIGHT - 0.5}
            y2={SPARK_HEIGHT - 0.5}
            stroke="var(--border)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={path}
            fill="none"
            stroke="var(--primary)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* The hover marker is HTML, not SVG: the plot is stretched with
            `preserveAspectRatio="none"`, which would squash a circle. */}
        {hoveredValue !== undefined && hovered !== null && (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 w-px bg-muted-foreground/40"
              style={{ left: `${xPercent(hovered)}%` }}
            />
            {Number.isFinite(hoveredValue) && (
              <span
                aria-hidden
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-sidebar bg-primary"
                style={{
                  left: `${xPercent(hovered)}%`,
                  top: `${(yOf(hoveredValue) / SPARK_HEIGHT) * 100}%`,
                }}
              />
            )}
          </>
        )}
      </div>

      <div
        className="mt-1 flex justify-between gap-1 font-mono text-[9px] text-muted-foreground tabular-nums"
        aria-hidden
      >
        <span>min {summary ? format(summary.min) : "—"}</span>
        <span>max {summary ? format(summary.max) : "—"}</span>
      </div>
    </div>
  );
}

function formatInteger(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value)) : "—";
}

/** 999, 12.4k, 1.23M — fits the status line's five characters. */
function formatCount(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const magnitude = Math.abs(value);
  if (magnitude < 1_000) return String(Math.round(value));
  if (magnitude < 1_000_000) {
    return `${(value / 1_000).toFixed(magnitude < 10_000 ? 1 : 0)}k`;
  }
  if (magnitude < 1_000_000_000) {
    return `${(value / 1_000_000).toFixed(magnitude < 10_000_000 ? 1 : 0)}M`;
  }
  return `${(value / 1_000_000_000).toFixed(1)}B`;
}

function formatMs(value: number): string {
  if (!Number.isFinite(value)) return "—";
  // Engine time per frame is routinely a fraction of a millisecond, which
  // one decimal would flatten to a misleading "0.0 ms".
  if (value < 1) return `${value.toFixed(2)} ms`;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ms`;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return `${value < 10 && value > 0 ? value.toFixed(1) : Math.round(value)}%`;
}

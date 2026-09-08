"use client";

import { intParam, stringParam } from "@/lib/nodes/define";
import {
  channelCount,
  MIN_TIME_SPAN_NS,
  NO_TRIGGER,
} from "@/lib/nodes/instruments/scope";
import type { WaveformSample } from "@/lib/sim/waveform";
import { cn } from "@/lib/utils";
import {
  readWaveform,
  useSimulationRevision,
  useSimulationStatus,
} from "@/state/simulation";
import type { NodeViewProps } from "./node-views";

/**
 * The oscilloscope's screen.
 *
 * It does not use `readPin`: a scope draws history, and history lives in the
 * engine's waveform recorder rather than on the nets. `useSimulationRevision`
 * is the subscription — a comparable number that changes once per frame — and
 * the samples themselves are read imperatively during the render it triggers,
 * because an array snapshot would never compare equal and would re-render for
 * ever.
 *
 * Drawn as SVG paths rather than React elements per sample, and with
 * `vectorEffect` so the traces keep their weight when the node is scaled by
 * the canvas transform.
 */

/** Viewbox units. Width is arbitrary; only the aspect ratio reaches the DOM. */
const VIEW_WIDTH = 1000;
const ROW_HEIGHT = 24;
const HIGH_Y = 5;
const LOW_Y = ROW_HEIGHT - 7;

export default function ScopeView({ node }: NodeViewProps) {
  // Subscribes; the value itself is only a change token.
  useSimulationRevision();
  const { time } = useSimulationStatus();

  const channels = channelCount(node.params);
  const span = Math.max(
    MIN_TIME_SPAN_NS,
    intParam(node.params, "timeSpanNs", 1000),
  );
  // Built as a list of identified rows rather than mapped by index below: a
  // channel's identity is its number, and React keys must not be positions.
  const traces = Array.from({ length: channels }, (_, index) => ({
    id: `ch${index}`,
    row: index,
    samples: readWaveform(node.id, `ch${index}`),
  }));

  const start = windowStart(node, traces, time, span);
  const height = channels * ROW_HEIGHT;

  return (
    <div
      className="h-full w-full overflow-hidden rounded-[2px] bg-background/60"
      role="img"
      aria-label={describeScope(node.label, channels, span, traces, start)}
    >
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden="true"
        focusable="false"
      >
        <title>Logic traces</title>
        {traces.map((trace) => (
          <Trace
            key={trace.id}
            samples={trace.samples}
            row={trace.row}
            start={start}
            span={span}
          />
        ))}
      </svg>
    </div>
  );
}

type Trace = {
  id: string;
  row: number;
  samples: WaveformSample[];
};

type TraceProps = {
  samples: readonly WaveformSample[];
  row: number;
  start: number;
  span: number;
};

function Trace({ samples, row, start, span }: TraceProps) {
  const top = row * ROW_HEIGHT;
  const x = (t: number) =>
    ((Math.min(Math.max(t, start), start + span) - start) / span) * VIEW_WIDTH;

  const segments = windowSegments(samples, start, span);

  return (
    <g>
      <line
        x1={0}
        y1={top + ROW_HEIGHT - 1}
        x2={VIEW_WIDTH}
        y2={top + ROW_HEIGHT - 1}
        className="stroke-border"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {segments.map((segment) =>
        segment.value === "0" || segment.value === "1" ? (
          <path
            key={`${segment.from}-${segment.value}`}
            d={levelPath(
              x(segment.from),
              x(segment.to),
              top + (segment.value === "1" ? HIGH_Y : LOW_Y),
              segment.previous === undefined
                ? undefined
                : top + (segment.previous === "1" ? HIGH_Y : LOW_Y),
            )}
            fill="none"
            className="stroke-primary"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          // X and Z are bands, not levels: drawing them at a height would
          // claim a value they do not have. X is marked as well as coloured.
          <rect
            key={`${segment.from}-${segment.value}`}
            x={x(segment.from)}
            y={top + HIGH_Y}
            width={Math.max(1, x(segment.to) - x(segment.from))}
            height={LOW_Y - HIGH_Y}
            className={cn(
              segment.value.includes("X")
                ? "fill-destructive/40 stroke-destructive"
                : "fill-muted stroke-muted-foreground/60",
            )}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ),
      )}
    </g>
  );
}

type Segment = {
  from: number;
  to: number;
  value: string;
  /** The level before this one, so a transition can be drawn as an edge. */
  previous: string | undefined;
};

/**
 * The recorded transitions clipped to the visible window, each carrying the
 * level it holds until the next one. The recorder stores only changes, so the
 * segment covering the left edge comes from the last sample before it.
 */
function windowSegments(
  samples: readonly WaveformSample[],
  start: number,
  span: number,
): Segment[] {
  const end = start + span;
  const segments: Segment[] = [];

  for (const [index, sample] of samples.entries()) {
    const next = samples[index + 1];
    const to = next ? next.time : end;
    if (to < start || sample.time > end) continue;

    segments.push({
      from: sample.time,
      to,
      value: sample.value,
      previous: samples[index - 1]?.value,
    });
  }

  return segments;
}

function levelPath(
  from: number,
  to: number,
  y: number,
  previousY: number | undefined,
): string {
  const edge =
    previousY !== undefined && previousY !== y
      ? `M${from} ${previousY} L${from} ${y} `
      : `M${from} ${y} `;
  return `${edge}L${to} ${y}`;
}

/**
 * Where the visible window starts. Free-running, it ends at the current time;
 * triggered, it begins at the most recent matching edge, which is what makes a
 * repeating waveform stand still instead of racing off the left.
 */
function windowStart(
  node: NodeViewProps["node"],
  traces: readonly Trace[],
  now: number,
  span: number,
): number {
  const channel = intParam(node.params, "triggerChannel", NO_TRIGGER);
  const samples = traces[channel]?.samples;
  if (channel < 0 || !samples) return Math.max(0, now - span);

  const level =
    stringParam(node.params, "triggerEdge", "rising") === "falling" ? "0" : "1";
  for (let index = samples.length - 1; index >= 1; index--) {
    if (samples[index].time > now) continue;
    if (samples[index].value === level && samples[index - 1].value !== level) {
      return samples[index].time;
    }
  }

  return Math.max(0, now - span);
}

function describeScope(
  label: string | undefined,
  channels: number,
  span: number,
  traces: readonly Trace[],
  start: number,
): string {
  const recorded = traces.reduce(
    (total, trace) => total + trace.samples.length,
    0,
  );
  return `${label ?? "Oscilloscope"}: ${channels} channels over ${span} ns from ${start} ns, ${recorded} recorded transitions`;
}

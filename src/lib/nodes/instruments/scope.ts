import { defineNode, type NodeParams } from "@/lib/nodes/define";
import { boundedParam, stack, stackHeight } from "../shared";

const MIN_CHANNELS = 1;
const MAX_CHANNELS = 8;

export const MIN_TIME_SPAN_NS = 10;
export const MAX_TIME_SPAN_NS = 1_000_000_000;

/** `-1` is a free-running scope: the window simply ends at the current time. */
export const NO_TRIGGER = -1;

export function channelCount(params: NodeParams): number {
  return boundedParam(params, "channels", 4, MIN_CHANNELS, MAX_CHANNELS);
}

/**
 * A logic analyser: it drives nothing and stores everything.
 *
 * The only node that calls `emitSample`, which is why the engine has a
 * waveform recorder at all. Its `delayNs` is zero so a sample lands at the
 * instant the net actually moved rather than a nanosecond after it — a scope
 * that skewed every trace by its own reaction time would be useless for
 * exactly the setup/hold questions it exists to answer.
 */
export const scopeNode = defineNode({
  type: "scope.logic",
  docs: `
A logic analyser. It drives nothing and records everything wired to it, so you
can see *when* a signal moved rather than only what it is now.

## Behaviour

**Channels** sets how many traces there are — one input pin each, all one bit
wide. Split a bus with \`bus.split\` to watch several of its lines.

**Time span (ns)** is the width of the visible window in simulated
nanoseconds. Narrow it to see individual gate delays; widen it to see a whole
sequence.

### Triggering

**Trigger channel** at −1 free-runs: the window simply ends at the current
time and everything scrolls. Set it to a channel number and the window is
anchored to that channel's most recent edge instead, with **Trigger edge**
picking rising or falling. A repeating waveform then stands still, which is
the only way to read a periodic signal properly.

### Why the traces line up

The scope reacts with **zero delay**, unlike every other element. A sample
lands at the instant the net actually moved rather than a nanosecond later — a
scope that skewed every trace by its own reaction time would be useless for
exactly the setup-and-hold questions it exists to answer.

Recorded samples are simulation state: a reset clears the traces, and so does
a structural edit.

## Typical uses

- Confirming a clock is running, and at what period, before debugging anything
  downstream.
- Watching a counter's bits and seeing that a ripple counter's stages do
  **not** switch together while a synchronous one's do.
- Setup and hold: put \`CLK\` on one channel and \`D\` on another, insert a
  \`time.delay\` in the data path, and watch the flip-flop start latching the
  wrong value.
- Catching a glitch that an \`io.led\` is far too slow to show.

## On the canvas

1. Place it — it is wide, so leave room — and wire one signal per \`CH\` pin.
2. Put the clock on \`CH0\` and set **Trigger channel** to 0 for a stable
   picture.
3. Press \`Space\` to run, or \`.\` to single-step and watch the trace advance
   one event at a time.`,
  title: "Oscilloscope",
  icon: "scope",
  category: "instruments",
  keywords: [
    "scope",
    "oscilloscope",
    "logic analyser",
    "logic analyzer",
    "waveform",
    "trace",
    "timing",
  ],
  defaultParams: {
    channels: 4,
    timeSpanNs: 1000,
    triggerChannel: NO_TRIGGER,
    triggerEdge: "rising",
  },
  view: "scope",
  paramsSchema: [
    {
      key: "channels",
      label: "Channels",
      kind: "int",
      min: MIN_CHANNELS,
      max: MAX_CHANNELS,
    },
    {
      key: "timeSpanNs",
      label: "Time span (ns)",
      kind: "int",
      min: MIN_TIME_SPAN_NS,
      max: MAX_TIME_SPAN_NS,
      hint: "Width of the visible window.",
    },
    {
      key: "triggerChannel",
      label: "Trigger channel",
      kind: "int",
      min: NO_TRIGGER,
      max: MAX_CHANNELS - 1,
      hint: "-1 free-runs; otherwise the window starts at that channel's last edge.",
    },
    {
      key: "triggerEdge",
      label: "Trigger edge",
      kind: "select",
      options: [
        { value: "rising", label: "Rising" },
        { value: "falling", label: "Falling" },
      ],
    },
  ],
  pins: (params) => {
    const channels = channelCount(params);
    return stack(
      Array.from({ length: channels }, (_, index) => ({
        id: `ch${index}`,
        name: `CH${index}`,
        direction: "in" as const,
        width: 1,
      })),
      "left",
      stackHeight(channels),
    );
  },
  size: (params) => ({ width: 24, height: stackHeight(channelCount(params)) }),
  delayNs: () => 0,
  evaluate: (ctx) => {
    const channels = channelCount(ctx.params);
    for (let index = 0; index < channels; index++) {
      const id = `ch${index}`;
      ctx.emitSample?.(id, ctx.read(id));
    }
  },
});

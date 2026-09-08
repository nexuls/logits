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

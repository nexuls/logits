import { boolParam, defineNode } from "@/lib/nodes/define";
import { createSignal, HIGH, LOW, X } from "@/lib/sim/logic";
import { boundedParam } from "../shared";

/**
 * A free-running square wave, and the only node that makes time pass on its
 * own: it re-schedules itself for its next edge rather than reacting to an
 * input. `en` gates it — held low the output sits at 0 and the node stops
 * scheduling entirely, so a disabled clock costs nothing per frame.
 */

const MIN_PERIOD_NS = 2;
const MAX_PERIOD_NS = 1_000_000_000;

type ClockState = {
  high: boolean;
  /**
   * Simulated time of the next edge, or -1 for "not started" — which is both
   * the state after a reset and the state a disabled clock returns to, so
   * re-enabling one starts a clean half-period rather than resuming a stale
   * phase.
   */
  nextEdgeAt: number;
};

export const clockNode = defineNode({
  type: "time.clock",
  docs: `
A free-running square wave, and the only element that makes time pass on its
own.

## Behaviour

Everything else in a circuit reacts to a change somewhere upstream. The clock
instead schedules its own next edge, which is what gets a sequential circuit
moving at all.

- **Period (ns)** is one full cycle in simulated nanoseconds. It is simulated
  time, not wall-clock time — the run speed control decides how fast that maps
  to seconds on screen.
- **Duty cycle (%)** is the share of the period spent high. Both halves are
  always at least one nanosecond, so an extreme duty cycle narrows a phase
  rather than collapsing it.
- **Start high** picks the phase the clock begins in after a reset.

\`EN\` gates it. Held low, the output sits at \`0\` and the clock stops
scheduling entirely, so a disabled clock is free. Re-enabling it starts a
clean half period rather than resuming a stale phase. Left unwired it runs.

An \`EN\` nobody can resolve puts \`X\` on the output while the phase keeps
running underneath, so the waveform recovers the moment \`EN\` does.

## Typical uses

- Driving \`CLK\` on flip-flops, registers, counters and synchronous RAM.
- Two clocks at different periods, to explore what happens when domains cross.
- A slow clock into \`EN\` of a fast one, for a gated burst.

Chain it into \`seq.counter\` to divide it down, or into \`scope.logic\` as a
timebase reference beside the signals you are actually measuring.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Clock",
  icon: "clock",
  view: "block",
  category: "timing",
  kind: "basic",
  keywords: ["clock", "clk", "oscillator", "square wave", "pulse", "source"],
  defaultParams: { periodNs: 100, dutyCycle: 50, startHigh: false },
  paramsSchema: [
    {
      key: "periodNs",
      label: "Period (ns)",
      kind: "int",
      min: MIN_PERIOD_NS,
      max: MAX_PERIOD_NS,
      hint: "One full cycle in simulated nanoseconds.",
    },
    {
      key: "dutyCycle",
      label: "Duty cycle (%)",
      kind: "int",
      min: 1,
      max: 99,
      hint: "Share of the period the output is high.",
    },
    { key: "startHigh", label: "Start high", kind: "bool" },
  ],
  pins: () => [
    { id: "en", name: "EN", direction: "in", width: 1, side: "top", offset: 3 },
    {
      id: "out",
      name: "OUT",
      direction: "out",
      width: 1,
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
  createState: (params) => ({
    high: boolParam(params, "startHigh", false),
    nextEdgeAt: -1,
  }),
  evaluate: (ctx) => {
    const state = ctx.state as ClockState;
    const period = boundedParam(
      ctx.params,
      "periodNs",
      100,
      MIN_PERIOD_NS,
      MAX_PERIOD_NS,
    );
    const duty = boundedParam(ctx.params, "dutyCycle", 50, 1, 99);
    // Both halves are at least a nanosecond: the engine's clock is integers,
    // and a zero-length half would be an edge that never separates from the
    // one before it — an oscillation rather than a clock.
    const highNs = Math.min(
      period - 1,
      Math.max(1, Math.round((period * duty) / 100)),
    );
    const lowNs = period - highNs;

    const enable = ctx.read("en")[0];

    if (enable === LOW) {
      state.nextEdgeAt = -1;
      state.high = false;
      ctx.write("out", createSignal(1, LOW));
      return;
    }

    if (state.nextEdgeAt < 0) {
      state.high = boolParam(ctx.params, "startHigh", false);
      state.nextEdgeAt = ctx.now + (state.high ? highNs : lowNs);
    } else if (ctx.now >= state.nextEdgeAt) {
      state.high = !state.high;
      state.nextEdgeAt = ctx.now + (state.high ? highNs : lowNs);
    }

    // An `en` nobody can resolve makes the output unknowable, but the phase
    // keeps running so the waveform recovers the instant `en` does.
    ctx.write(
      "out",
      createSignal(1, enable === X ? X : state.high ? HIGH : LOW),
    );
    ctx.scheduleSelf(state.nextEdgeAt - ctx.now);
  },
});

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
  title: "Clock",
  icon: "clock",
  category: "timing",
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

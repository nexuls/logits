import { defineNode } from "@/lib/nodes/define";
import { createSignal, HIGH, LOW, type LogicValue, X } from "@/lib/sim/logic";
import { detectEdge, edgeMode, NO_LEVEL } from "../edges";
import { boundedParam } from "../shared";

const MAX_WIDTH_NS = 1_000_000_000;

type OneshotState = {
  last: LogicValue | typeof NO_LEVEL;
  /** Simulated time the pulse ends, or -1 when the output is idle. */
  until: number;
};

/**
 * A monostable: an edge on `in` starts a pulse of `widthNs` on `out`.
 *
 * Re-triggerable — an edge during a pulse restarts it rather than being
 * ignored — which is the behaviour that makes it useful as a debouncer.
 */
export const oneshotNode = defineNode({
  type: "time.oneshot",
  docs: `
A monostable: an edge on \`A\` produces a single pulse of a fixed width on
\`Y\`, whatever the input does afterwards.

## Behaviour

- **Pulse width (ns)** is how long \`Y\` stays high after a trigger.
- **Trigger edge** picks rising, falling or both.

It is **re-triggerable**: an edge arriving during a pulse restarts the pulse
rather than being ignored. That is what makes it a debouncer — a burst of
edges shorter than the pulse width comes out as one clean pulse that ends a
full width after the *last* bounce.

A trigger that cannot be resolved — an edge into or out of \`X\` — cancels the
pulse and leaves \`Y\` at \`X\` until a clean edge arrives, rather than
guessing.

## Typical uses

- Debouncing \`io.button\` before it clocks anything.
- Turning a level into a strobe: a long \`load\` signal into a one-shot gives
  a single-cycle write enable.
- Stretching a pulse too narrow to see on \`scope.logic\` or to light an LED.
- An edge detector — set the width to one clock period and the output is high
  for exactly the cycle after the edge.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "One-shot",
  icon: "pulse",
  category: "timing",
  kind: "basic",
  keywords: ["oneshot", "monostable", "pulse", "trigger", "edge", "debounce"],
  defaultParams: { widthNs: 50, edge: "rising" },
  paramsSchema: [
    {
      key: "widthNs",
      label: "Pulse width (ns)",
      kind: "int",
      min: 1,
      max: MAX_WIDTH_NS,
    },
    {
      key: "edge",
      label: "Trigger edge",
      kind: "select",
      options: [
        { value: "rising", label: "Rising" },
        { value: "falling", label: "Falling" },
        { value: "both", label: "Both" },
      ],
    },
  ],
  pins: () => [
    { id: "in", name: "A", direction: "in", width: 1, side: "left", offset: 2 },
    {
      id: "out",
      name: "Y",
      direction: "out",
      width: 1,
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
  createState: () => ({ last: NO_LEVEL, until: -1 }),
  evaluate: (ctx) => {
    const state = ctx.state as OneshotState;
    const pulseNs = boundedParam(ctx.params, "widthNs", 50, 1, MAX_WIDTH_NS);

    const level = ctx.read("in")[0] as LogicValue;
    const edge = detectEdge(state.last, level, edgeMode(ctx.params.edge));
    state.last = level;

    if (edge === "unknown") {
      // Something happened on the trigger and nobody can say what, so the
      // output is unknown until the next clean edge resolves it.
      state.until = -1;
      ctx.write("out", createSignal(1, X));
      return;
    }

    if (edge === "edge") {
      state.until = ctx.now + pulseNs;
      ctx.write("out", createSignal(1, HIGH));
      ctx.scheduleSelf(pulseNs);
      return;
    }

    if (state.until >= 0 && ctx.now >= state.until) state.until = -1;
    ctx.write("out", createSignal(1, state.until >= 0 ? HIGH : LOW));
  },
});

import { defineNode, stringParam } from "@/lib/nodes/define";
import { createSignal, HIGH, LOW, type LogicValue } from "@/lib/sim/logic";
import { boundedParam } from "../shared";

/**
 * One pulse, at the start of the run, and then nothing: the power-on reset a
 * sequential circuit needs before its first clock edge means anything.
 *
 * It is not `time.oneshot` with the trigger removed. A one-shot reacts to an
 * edge, and at t = 0 there is no edge to react to — the whole difficulty of
 * initialising a circuit in this app is that every net starts `Z` and nothing
 * has happened yet. This node is the one that makes something happen.
 */

const MAX_NS = 1_000_000_000;

type KickstartState = {
  /** Simulated time the pulse begins, or -1 before the first evaluation. */
  startAt: number;
};

export const kickstartNode = defineNode({
  type: "io.kickstart",
  docs: `
A single pulse when the simulation starts, and nothing afterwards — the
power-on reset that gets a sequential circuit into a known state.

## Behaviour

On reset, \`OUT\` pulses once for **Pulse width (ns)**, optionally after
**Start delay (ns)**, and then sits idle forever. It never fires again until
the simulation is reset, which is the whole difference from \`time.clock\`.

**Active level** picks which way round the pulse is. Active high idles at
\`0\` and pulses to \`1\`; active low idles at \`1\` and pulses to \`0\`,
which is what a \`RST\` pin drawn with a bubble, or an active-low \`load\`,
wants.

The delay matters more than it looks. A reset that arrives at t = 0 lands
while every other node is also evaluating for the first time; a few
nanoseconds of delay puts the pulse cleanly after the circuit has settled,
which is what a real power-on reset circuit is for.

Once the pulse is over the node stops scheduling entirely, so an idle
kick-start costs nothing per frame.

## Typical uses

- Clearing counters, registers and flip-flops out of \`X\` before the first
  clock edge, so a waveform starts from a defined state instead of an unknown
  one.
- Loading a start address: the pulse on a counter's \`LOAD\` with \`D\` tied
  to a \`io.constant\`.
- Kicking a ring counter or a one-hot state machine into its first state,
  which is the classic circuit that will not start on its own.
- Firing a \`time.oneshot\` chain, where each pulse triggers the next stage.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Wire \`OUT\` to the \`RST\`, \`SET\` or \`LOAD\` it should drive.
3. Reset the simulation to see it fire again.`,
  title: "Kick-start",
  shortTitle: "KICK",
  icon: "power",
  view: "block",
  category: "io",
  kind: "basic",
  keywords: [
    "kickstart",
    "kick start",
    "power on",
    "reset",
    "startup",
    "initialise",
    "por",
    "source",
  ],
  defaultParams: { widthNs: 50, startDelayNs: 0, active: "high" },
  paramsSchema: [
    {
      key: "widthNs",
      label: "Pulse width (ns)",
      kind: "int",
      min: 1,
      max: MAX_NS,
    },
    {
      key: "startDelayNs",
      label: "Start delay (ns)",
      kind: "int",
      min: 0,
      max: MAX_NS,
      hint: "Lets the circuit settle before the pulse.",
    },
    {
      key: "active",
      label: "Active level",
      kind: "select",
      options: [
        { value: "high", label: "Active high" },
        { value: "low", label: "Active low" },
      ],
    },
  ],
  pins: () => [
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
  createState: () => ({ startAt: -1 }),
  evaluate: (ctx) => {
    const state = ctx.state as KickstartState;
    const pulseNs = boundedParam(ctx.params, "widthNs", 50, 1, MAX_NS);

    if (state.startAt < 0) {
      state.startAt =
        ctx.now + boundedParam(ctx.params, "startDelayNs", 0, 0, MAX_NS);
    }

    // Recomputed rather than stored, so widening the pulse from the inspector
    // while it is running extends the pulse instead of being ignored.
    const endAt = state.startAt + pulseNs;
    const asserted = ctx.now >= state.startAt && ctx.now < endAt;
    const active: LogicValue =
      stringParam(ctx.params, "active", "high") === "low" ? LOW : HIGH;

    ctx.write(
      "out",
      createSignal(1, asserted ? active : active === HIGH ? LOW : HIGH),
    );

    // Nothing is scheduled once the pulse is over: this node makes time pass
    // exactly twice in a run.
    if (ctx.now < state.startAt) ctx.scheduleSelf(state.startAt - ctx.now);
    else if (ctx.now < endAt) ctx.scheduleSelf(endAt - ctx.now);
  },
});

import { defineNode } from "@/lib/nodes/define";
import { AND2, combine } from "@/lib/sim/logic";
import { boundedParam, widthOf, widthParam } from "../shared";

const MAX_DELAY_NS = 1_000_000_000;

/**
 * A buffer whose whole point is its propagation delay — which is why
 * `delayNs` is a function of params on `NodeDefinition` at all.
 *
 * The delay is the node's *reaction* time, not an extra on the write, so a
 * pulse shorter than the delay still arrives: the engine schedules one
 * evaluation per input change and each carries the value read at that time.
 */
export const delayNode = defineNode({
  type: "time.delay",
  docs: `
A buffer whose point is its propagation delay: \`A\` reaches \`Y\` unchanged,
**Delay (ns)** later.

## Behaviour

Every element here reacts a nanosecond after its inputs move. This is the one
where that number is yours to set.

The delay is the element's *reaction* time, not a stretch applied to the
output, so a pulse narrower than the delay still arrives intact — it just
arrives late. Each input change is scheduled separately and carries the value
read when it happened.

A floating input reads \`X\` on the output, the same as \`gate.buffer\`.
Setting the delay to 0 makes it transparent, which is occasionally what you
want for a probe tap that must not skew.

Changing **Delay (ns)** is a structural edit: it rebuilds the compiled
circuit, which resets stored values. Changing it mid-run is therefore not the
same as flipping a switch mid-run.

## Typical uses

- Deliberately creating a race: split a signal, delay one branch, and watch a
  glitch appear at the gate where the two meet.
- Modelling a slow path in a critical-path exercise.
- Setup and hold experiments — delay \`D\` relative to \`CLK\` and watch a
  flip-flop start latching the wrong value on \`scope.logic\`.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Delay",
  icon: "hourglass",
  view: "block",
  category: "timing",
  kind: "basic",
  keywords: ["delay", "propagation", "lag", "buffer", "timing"],
  defaultParams: { width: 1, delayNs: 10 },
  paramsSchema: [
    {
      key: "delayNs",
      label: "Delay (ns)",
      kind: "int",
      min: 0,
      max: MAX_DELAY_NS,
    },
    widthParam(),
  ],
  pins: (params) => {
    const width = widthOf(params);
    return [
      { id: "in", name: "A", direction: "in", width, side: "left", offset: 2 },
      {
        id: "out",
        name: "Y",
        direction: "out",
        width,
        side: "right",
        offset: 2,
      },
    ];
  },
  size: () => ({ width: 6, height: 4 }),
  delayNs: (params) => boundedParam(params, "delayNs", 10, 0, MAX_DELAY_NS),
  evaluate: (ctx) => {
    // A lone input folds to itself; the fold is only here to normalise a
    // floating Z to X, the same as `gate.buffer`.
    ctx.write("out", combine([ctx.read("in")], widthOf(ctx.params), AND2));
  },
});

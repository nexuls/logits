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
  title: "Delay",
  icon: "hourglass",
  category: "timing",
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

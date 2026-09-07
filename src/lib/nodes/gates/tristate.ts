import { defineNode, intParam } from "@/lib/nodes/define";
import { AND2, combine, createSignal, HIGH, LOW, X, Z } from "@/lib/sim/logic";

/**
 * The one gate that is not `symmetricGate`: `en` is always one bit wide no
 * matter the data `width`, and it sits on the top edge like every other
 * enable in the catalog.
 */
export const tristateGate = defineNode({
  type: "gate.tristate",
  title: "Tri-state",
  icon: "tristate",
  category: "gates",
  keywords: ["tristate", "three state", "buffer", "enable", "z", "bus"],
  defaultParams: { width: 1 },
  pins: (params) => {
    const width = intParam(params, "width", 1);

    return [
      { id: "in", name: "A", direction: "in", width, side: "left", offset: 2 },
      {
        id: "en",
        name: "EN",
        direction: "in",
        width: 1,
        side: "top",
        offset: 3,
      },
      {
        id: "out",
        name: "Y",
        direction: "out",
        width,
        side: "right",
        offset: 2,
        // The point of the gate: with `en` low it drives Z, so several of
        // these may share a net without it being a multi-driver short.
        tristate: true,
      },
    ];
  },
  size: () => ({ width: 6, height: 4 }),
  evaluate: (ctx) => {
    const width = intParam(ctx.params, "width", 1);
    const enable = ctx.read("en")[0];

    // Enabled, this is an ordinary buffer, which includes turning a floating
    // input into X: passing the Z straight through would have an actively
    // driving output claim to be switched off.
    if (enable === HIGH) {
      ctx.write("out", combine([ctx.read("in")], width, AND2));
    } else if (enable === LOW) {
      ctx.write("out", createSignal(width, Z));
    } else {
      // Whether this driver is on is exactly what nobody knows, so neither a
      // value nor Z would be honest.
      ctx.write("out", createSignal(width, X));
    }
  },
});

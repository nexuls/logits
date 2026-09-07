import { defineNode, intParam } from "@/lib/nodes/define";

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
});

import { defineNode } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

/**
 * A hexadecimal readout of a whole bus.
 *
 * It shares the probe's `readout` view rather than owning one: both display a
 * single net's value and differ only in the radix and the footprint, and
 * keying views by behaviour instead of node type is what makes that possible.
 * `radix` is fixed rather than offered — a hex display that could be set to
 * decimal would just be a second probe.
 */
export const hexDisplayNode = defineNode({
  type: "disp.hex",
  title: "Hex display",
  icon: "hex",
  category: "instruments",
  keywords: ["hex", "hexadecimal", "display", "readout", "number", "digits"],
  defaultParams: { width: 8, radix: "hex" },
  view: "readout",
  paramsSchema: [widthParam()],
  pins: (params) => [
    {
      id: "in",
      name: "IN",
      direction: "in",
      width: widthOf(params),
      side: "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 8, height: 4 }),
});

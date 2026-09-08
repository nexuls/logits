import { defineNode } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

const MAX_BARS = 16;

/** One lamp per bit, least significant at the bottom. */
export const bargraphNode = defineNode({
  type: "disp.bargraph",
  title: "Bargraph",
  icon: "bargraph",
  category: "instruments",
  keywords: ["bargraph", "bar", "leds", "display", "bits", "meter"],
  defaultParams: { width: 8, color: "green" },
  view: "bargraph",
  paramsSchema: [
    widthParam("One lamp per bit.", MAX_BARS),
    {
      key: "color",
      label: "Colour",
      kind: "color",
      options: [
        { value: "green", label: "Green", swatch: "var(--logit-led-green)" },
        { value: "red", label: "Red", swatch: "var(--logit-led-red)" },
        { value: "amber", label: "Amber", swatch: "var(--logit-led-amber)" },
        { value: "blue", label: "Blue", swatch: "var(--logit-led-blue)" },
      ],
    },
  ],
  pins: (params) => [
    {
      id: "in",
      name: "IN",
      direction: "in",
      width: widthOf(params, MAX_BARS),
      side: "left",
      offset: 3,
    },
  ],
  size: () => ({ width: 6, height: 6 }),
});

import { defineNode, intParam } from "@/lib/nodes/define";

export const probeNode = defineNode({
  type: "io.probe",
  title: "Probe",
  icon: "gauge",
  category: "io",
  keywords: ["probe", "readout", "value", "monitor", "output", "sink"],
  defaultParams: { width: 1, radix: "binary" },
  pins: (params) => [
    {
      id: "in",
      name: "IN",
      direction: "in",
      width: intParam(params, "width", 1),
      side: "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
});

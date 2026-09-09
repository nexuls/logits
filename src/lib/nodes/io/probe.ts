import { defineNode, intParam } from "@/lib/nodes/define";

export const probeNode = defineNode({
  type: "io.probe",
  docs: `
A numeric readout of a whole bus, in the radix you choose.

## Behaviour

Wire any net to \`IN\` and the probe shows its current value. Set **Bit
width** to match what you are probing — a probe narrower than the bus shows
only the low bits, and a wider one raises a width-mismatch warning on the
wire.

**Radix** picks binary, decimal or hexadecimal. Bits that are unknown or
floating are shown as such rather than being counted as zero, so a value that
looks wrong is distinguishable from one that is not yet driven.

It is a pure sink: it drives nothing and cannot disturb the circuit it is
measuring.

## Typical uses

- Reading a counter or register without decoding it by eye from LEDs.
- Watching an address bus while a ROM is being read.
- Checking an adder's result against what you expected, in decimal.

\`disp.hex\` is the same readout fixed to hexadecimal with a larger face, for
a value you want to read from across the canvas.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Probe",
  icon: "gauge",
  category: "io",
  kind: "basic",
  keywords: ["probe", "readout", "value", "monitor", "output", "sink"],
  defaultParams: { width: 1, radix: "binary" },
  view: "readout",
  paramsSchema: [
    { key: "width", label: "Bit width", kind: "int", min: 1, max: 64 },
    {
      key: "radix",
      label: "Radix",
      kind: "select",
      options: [
        { value: "binary", label: "Binary" },
        { value: "decimal", label: "Decimal" },
        { value: "hex", label: "Hexadecimal" },
      ],
    },
  ],
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

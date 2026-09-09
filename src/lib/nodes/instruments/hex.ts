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
  docs: `
A large hexadecimal readout of a whole bus.

## Behaviour

Wire any net to \`IN\` and set **Bit width** to match it; the value is shown
in hex, four bits per digit. Bits that are unknown or floating are shown as
such rather than being counted as zero.

The radix is fixed. A hex display that could be switched to decimal would just
be a second \`io.probe\` — which is the element to use when you want the
choice, or a smaller footprint.

It drives nothing and cannot disturb the circuit it is measuring.

## Typical uses

- An address or data bus you want to read from across the canvas.
- A register or accumulator value during a stepped run.
- Watching \`mem.rom\` output while a counter walks the address, to check an
  image was typed in correctly.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Hex display",
  icon: "hex",
  category: "instruments",
  kind: "basic",
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

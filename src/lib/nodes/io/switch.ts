import { defineNode, intParam } from "@/lib/nodes/define";
import { toBits } from "@/lib/sim/logic";

export const switchNode = defineNode({
  type: "io.switch",
  docs: `
A latching input source. Click it to toggle; it stays where you put it.

## Behaviour

The switch's position is the \`value\` param — part of the **document**, not
the simulation — so it survives a reload, undoes with \`Ctrl/Cmd + Z\`, and is
saved with the circuit. Resetting the simulation does not move it.

Clicking the body toggles bit 0. For a wider switch, set **Bit width** and
type the whole word into **Value** as a decimal number; the bits appear on
\`OUT\` least significant first.

Toggling works while the simulation is paused as well as running — the editor
settles the circuit after the edit, so you can single-step through a change
with \`.\` and watch it propagate.

## Typical uses

- The stimulus for anything you are testing by hand.
- A DIP-switch bank: one 8-bit switch feeding a \`bus.split\`, or eight
  1-bit ones.
- A mode select feeding a multiplexer's \`SEL\`.

For a source that is only high while held, use \`io.button\`. For one that
never changes, use \`io.constant\`.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Switch",
  icon: "toggle",
  category: "io",
  kind: "basic",
  keywords: ["switch", "toggle", "input", "source", "dip"],
  defaultParams: { width: 1, value: 0 },
  view: "toggle",
  paramsSchema: [
    { key: "width", label: "Bit width", kind: "int", min: 1, max: 64 },
    {
      key: "value",
      label: "Value",
      kind: "int",
      min: 0,
      hint: "Decimal; the switch body toggles bit 0 on click.",
    },
  ],
  pins: (params) => [
    {
      id: "out",
      name: "OUT",
      direction: "out",
      width: intParam(params, "width", 1),
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 4, height: 4 }),
  /**
   * The switch's position lives in `value`, a document param, so it survives a
   * reload and undoes with everything else. Toggling it is a command, and the
   * editor then asks the engine to re-evaluate this node — a param change is
   * not an event the engine can see for itself.
   */
  evaluate: (ctx) => {
    ctx.write(
      "out",
      toBits(
        intParam(ctx.params, "value", 0),
        intParam(ctx.params, "width", 1),
      ),
    );
  },
});

import { defineNode, type NodeParams, stringParam } from "@/lib/nodes/define";
import { widthOf, widthParam } from "../shared";

/**
 * A boundary pin, placed *inside* a subcircuit definition.
 *
 * Its `direction` param is written from the chip's point of view, not the
 * port's: an "input" port is something the parent circuit drives into the
 * chip, so inside the definition it is a *source* and its `io` pin is an
 * output. Getting that backwards is the classic way to end up with every
 * signal reading Z, which is why it is spelled out here rather than left to
 * the reader.
 *
 * It has no `evaluate`. When the chip is inlined, this node's `io` net and the
 * instance pin's net become one net, so the port is a join and not a buffer.
 */
export const portNode = defineNode({
  type: "sub.port",
  docs: `
A boundary pin, placed **inside** a subcircuit definition. It becomes one pin
on every instance of that chip.

## Behaviour

**Port name** is the pin's name on the instance, so keep it short — \`CLK\`,
\`D\`, \`Q\`. A blank name defines no pin at all.

**Direction** is written from the *chip's* point of view, not the port's:

- **Input to the chip** — the parent circuit drives it. Inside the definition
  it is therefore a *source*, and its pin sits on the right, feeding your logic.
- **Output from the chip** — your logic drives it, and it appears on the left.

Getting that backwards is the classic way to end up with every signal reading
\`Z\`. If a chip's outputs are all floating, check the port directions first.

**Bit width** is the width of the pin on the instance.

The port is a **join**, not a buffer: when the chip is inlined, this element's
net and the instance pin's net become one net. It adds no delay and drives
nothing itself.

## Typical uses

Building a reusable chip:

1. Create a subcircuit and place your logic inside it.
2. Add a port for every signal that should cross the boundary, naming each one.
3. Set each port's direction from the chip's point of view.
4. Place an instance of the chip in a parent circuit — the ports are its pins,
   in the order and with the names you gave them.

Renaming a port changes the instance's pin, so wires already landed on the old
name will need re-attaching.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Port",
  icon: "port",
  category: "sub",
  keywords: ["port", "pin", "boundary", "subcircuit", "chip", "interface"],
  defaultParams: { name: "IN", direction: "in", width: 1 },
  paramsSchema: [
    {
      key: "name",
      label: "Port name",
      kind: "text",
      maxLength: 32,
      hint: "Becomes the pin's name on every instance of this chip.",
    },
    {
      key: "direction",
      label: "Direction",
      kind: "select",
      options: [
        { value: "in", label: "Input to the chip" },
        { value: "out", label: "Output from the chip" },
      ],
    },
    widthParam(),
  ],
  pins: (params) => [
    {
      // `inout`, not a direction: the port passes a signal across the
      // boundary and drives nothing itself. Declaring it as an output would
      // make every wired-up instance a two-driver short once the chip is
      // inlined, since the parent's driver lands on this very net.
      id: "io",
      name: portName(params),
      direction: "inout",
      width: widthOf(params),
      side: isInputPort(params) ? "right" : "left",
      offset: 2,
    },
  ],
  size: () => ({ width: 6, height: 4 }),
  boundaryPort: (params) => {
    const name = portName(params);
    return name.length > 0
      ? {
          name,
          pinId: "io",
          direction: isInputPort(params) ? ("in" as const) : ("out" as const),
        }
      : undefined;
  },
});

export function portName(params: NodeParams): string {
  return stringParam(params, "name", "").trim();
}

export function isInputPort(params: NodeParams): boolean {
  return stringParam(params, "direction", "in") !== "out";
}

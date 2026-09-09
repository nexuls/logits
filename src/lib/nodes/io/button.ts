import { boolParam, defineNode } from "@/lib/nodes/define";
import { createSignal, HIGH, LOW } from "@/lib/sim/logic";

/** Momentary: high only while held, so it has no stored `value` param. */
export const buttonNode = defineNode({
  type: "io.button",
  docs: `
A momentary input: high while held, low the instant it is released.

## Behaviour

Press and hold the body to drive \`OUT\` high. There is no stored position —
that is the whole difference from \`io.switch\` — so the \`pressed\` param is
only ever true mid-press, and a saved circuit always reloads with the button
up.

It is always one bit wide. A button is a moment in time, not a word.

Because a real button bounces and this one does not, a circuit that works here
may still need debouncing on hardware. \`time.oneshot\` is the part that
models the fix: it is re-triggerable, so a burst of edges produces one clean
pulse.

## Typical uses

- A manual clock: wire it to a flip-flop's \`CLK\` and step the circuit by
  hand, one press per edge.
- A reset: wire it to \`RST\` on a counter or register.
- A load or enable strobe alongside \`seq.register\`.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Button",
  icon: "push-button",
  category: "io",
  kind: "basic",
  keywords: ["button", "momentary", "push", "input", "source"],
  defaultParams: { pressed: false },
  view: "push-button",
  paramsSchema: [{ key: "pressed", label: "Pressed", kind: "bool" }],
  pins: () => [
    {
      id: "out",
      name: "OUT",
      direction: "out",
      width: 1,
      side: "right",
      offset: 2,
    },
  ],
  size: () => ({ width: 4, height: 4 }),
  evaluate: (ctx) => {
    const pressed = boolParam(ctx.params, "pressed", false);
    ctx.write("out", createSignal(1, pressed ? HIGH : LOW));
  },
});

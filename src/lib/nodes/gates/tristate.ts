import { defineNode, intParam } from "@/lib/nodes/define";
import { AND2, combine, createSignal, HIGH, LOW, X, Z } from "@/lib/sim/logic";

/**
 * The one gate that is not `symmetricGate`: `en` is always one bit wide no
 * matter the data `width`, and it sits on the top edge like every other
 * enable in the catalog.
 */
export const tristateGate = defineNode({
  type: "gate.tristate",
  docs: `
A buffer that can **let go** of its output. With \`EN\` high it passes \`A\`
through; with \`EN\` low it stops driving altogether and \`Y\` floats at
\`Z\`.

## Behaviour

\`Z\` is not a level — it is *nobody is driving this net*. That is what makes
this gate different from an AND: a disabled tri-state does not output \`0\`, it
outputs nothing, so another driver on the same net is free to decide the value.

| EN | Y |
| :-: | :-- |
| 1 | \`A\` (a floating \`A\` reads \`X\`) |
| 0 | \`Z\` — released |
| X | \`X\` — nobody knows whether this driver is on |

\`EN\` is always one bit wide however wide the data is, and it sits on the top
edge like every other enable in the catalog. Its output pin is marked
tri-state, which is what tells the netlist that several of these sharing a net
is a bus and not a short circuit.

## Building a bus

1. Place one tri-state per source and wire every \`Y\` to the same net.
2. Drive exactly one \`EN\` high at a time — \`comb.decoder\` is the usual
   way, since its outputs are one-hot by construction.
3. Enable two at once with different data and the net is contended: it reads
   \`X\` and the wire is flagged with a multiple-drivers diagnostic.

Leaving *every* enable low leaves the bus floating at \`Z\`, which reads as
unknown downstream rather than as zero. A pull-down — an \`io.constant\` of 0
through a resistor is not modelled here — is not available, so drive the bus
from a default source instead.

## On the canvas

1. Click the element in the palette, then click the canvas to place it.
2. Click a pin to start a wire and a second pin to land it; \`Esc\` cancels.
3. Select the element to open the inspector over it and edit the settings above.`,
  title: "Tri-state",
  shortTitle: "TRI",
  icon: "tristate",
  view: "block",
  category: "gates",
  // One pin to a side, and the enable is the only pin on the top edge, so
  // its stub already says which one it is.
  kind: "basic",
  keywords: ["tristate", "three state", "buffer", "enable", "z", "bus"],
  defaultParams: { width: 1 },
  paramsSchema: [
    { key: "width", label: "Bit width", kind: "int", min: 1, max: 64 },
  ],
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

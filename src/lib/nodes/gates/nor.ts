import { OR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const norGate = symmetricGate({
  type: "gate.nor",
  docs: `
OR with the output inverted: high only when **every** input is low.

## Behaviour

\`1\` is the controlling value and forces the output low, so one input
genuinely high settles \`Y\` at \`0\` regardless of unknowns elsewhere.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 1 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 0 |

## Typical uses

Like NAND, NOR is functionally complete on its own.

- A zero detector: NOR a whole bus (raise **Bit width** to 1 and use one input
  per bit, or feed it through \`bus.split\`) and \`Y\` is high exactly when
  every bit is low.
- Cross-coupled NORs make an SR latch that sets and resets on *high* inputs,
  the mirror of the NAND version.`,
  title: "NOR",
  icon: "nor",
  view: "block",
  keywords: ["nor", "not or", "universal"],
  op: OR2,
  invert: true,
});

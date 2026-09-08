import { XOR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const xorGate = symmetricGate({
  type: "gate.xor",
  docs: `
Exclusive OR: high when an **odd** number of inputs are high.

## Behaviour

With two inputs this reads as "the inputs differ". With more it is a parity
tree, since the fold is pairwise.

XOR has no controlling value: every input matters, so a single unresolved
input leaves the output \`X\` even when the rest are known.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

## Typical uses

- **Half adder** — XOR gives the sum bit, AND gives the carry. \`comb.adder\`
  is the built-in version once you have seen how it works.
- **Controlled inverter** — one input is data, the other decides whether to
  flip it. This is how a subtracting ALU negates its second operand.
- **Difference detector** — a wide XOR followed by an OR of the lanes is high
  whenever two buses disagree.`,
  title: "XOR",
  icon: "xor",
  keywords: ["xor", "exclusive or", "^", "parity"],
  op: XOR2,
});

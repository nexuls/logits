import { unaryGate } from "./shared";

export const notGate = unaryGate({
  type: "gate.not",
  docs: `
An inverter: \`Y\` is the opposite of \`A\`, bit for bit.

## Behaviour

The simplest element in the catalog, and the one most circuits need most of.
\`0\` becomes \`1\`, \`1\` becomes \`0\`, and anything unresolved stays
unresolved — inverting an unknown gives an unknown, not a guess.

| A | Y |
| :-: | :-: |
| 0 | 1 |
| 1 | 0 |
| X | X |
| Z | X |

At **Bit width** above 1 it inverts every lane independently, which is the
one's complement of the word.

## Typical uses

- Building NAND/NOR/XNOR by hand, or an active-low enable from an active-high
  one.
- Feeding \`Q\` back to \`D\` on a flip-flop to make a divide-by-two.
- Two in series as a delay-and-buffer pair — though \`time.delay\` is the
  honest way to ask for propagation delay.`,
  title: "NOT",
  icon: "inverter",
  keywords: ["not", "inverter", "invert", "!"],
  invert: true,
});

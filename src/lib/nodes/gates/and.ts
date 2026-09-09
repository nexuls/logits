import { AND2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const andGate = symmetricGate({
  type: "gate.and",
  docs: `
Conjunction: the output is high only when **every** input is high.

## Behaviour

Folded pairwise across the inputs, one bit lane at a time, so a 2-input AND
and an 8-input AND are the same part with a different pin count.

\`0\` is the *controlling* value — a single input actually low forces the
output low no matter what the rest are doing, unknowns included.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 0 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

## Typical uses

- Gating a signal: wire the data to \`A0\` and an enable to \`A1\`, and the
  data only reaches \`Y\` while the enable is high.
- Decoding an address: one AND per combination, with NOT gates on the bits
  that must be low.
- Masking a bus: raise **Bit width** and AND the word against a constant.`,
  title: "AND",
  icon: "and",
  view: "block",
  keywords: ["and", "conjunction", "&"],
  op: AND2,
});

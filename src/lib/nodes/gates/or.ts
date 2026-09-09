import { OR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const orGate = symmetricGate({
  type: "gate.or",
  docs: `
Disjunction: the output is high when **any** input is high.

## Behaviour

\`1\` is the controlling value here — one input actually high forces the
output high, whatever the others are, so an OR with a known \`1\` never reads
\`X\`.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 0 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 1 |

## Typical uses

- Collecting several conditions into one flag — any interrupt, any error.
- Merging one-hot decoder outputs back into a group select.
- Forcing a line high from more than one place without shorting two drivers
  together, which is what wiring two outputs to one net would do.`,
  title: "OR",
  icon: "or",
  view: "block",
  keywords: ["or", "disjunction", "|"],
  op: OR2,
});

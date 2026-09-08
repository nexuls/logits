import { XOR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const xnorGate = symmetricGate({
  type: "gate.xnor",
  docs: `
Exclusive NOR: high when an **even** number of inputs are high.

## Behaviour

With two inputs it is an equality test — \`Y\` is high exactly when the inputs
match. Like XOR it has no controlling value, so one unresolved input makes the
output \`X\`.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 1 |
| 0 | 1 | 0 |
| 1 | 0 | 0 |
| 1 | 1 | 1 |

## Typical uses

- Comparing two buses bit for bit, then ANDing the lanes together for an
  "all equal" flag. \`comb.comparator\` does this and the magnitude
  comparison in one part.
- Even-parity generation and checking.`,
  title: "XNOR",
  icon: "xnor",
  keywords: ["xnor", "exclusive nor", "equivalence"],
  op: XOR2,
  invert: true,
});

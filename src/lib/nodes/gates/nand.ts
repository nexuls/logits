import { AND2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const nandGate = symmetricGate({
  type: "gate.nand",
  docs: `
AND with the output inverted: low only when **every** input is high.

## Behaviour

\`0\` is still the controlling value, and it now forces the output *high*, so
one input genuinely low pins \`Y\` to \`1\` however unresolved the others are.

| A0 | A1 | Y |
| :-: | :-: | :-: |
| 0 | 0 | 1 |
| 0 | 1 | 1 |
| 1 | 0 | 1 |
| 1 | 1 | 0 |

## Typical uses

NAND is *functionally complete*: every other gate can be built from it alone,
which is why real logic families are full of them.

- An inverter — tie both inputs to the same net.
- AND — a NAND followed by a NOT.
- OR — a NAND with both inputs inverted first (De Morgan).
- Two cross-coupled NANDs are an SR latch, the classic first sequential
  circuit to build here. \`seq.latch\` is the ready-made version.`,
  title: "NAND",
  icon: "nand",
  keywords: ["nand", "not and", "universal"],
  op: AND2,
  invert: true,
});

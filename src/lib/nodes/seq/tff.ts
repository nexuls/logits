import { HIGH, LOW, X } from "@/lib/sim/logic";
import { bitFlop, toggle } from "./shared";

export const tFlipFlop = bitFlop({
  type: "seq.tff",
  docs: `
The toggle flip-flop: \`Q\` flips at the clock edge whenever \`T\` is high,
and holds when it is low.

## Behaviour

| T | Q after the edge |
| :-: | :-- |
| 1 | toggled |
| 0 | unchanged |

A JK with both inputs tied together, and the smallest frequency divider there
is: hold \`T\` high and \`Q\` runs at exactly half the clock rate.

A \`T\` that cannot be resolved leaves \`Q\` at \`X\` — with only one input
there is nothing else to decide the answer.

Always one bit wide.

## Typical uses

- **Frequency division** — \`T\` tied high, one stage per halving.
- **Ripple counter** — chain them with each \`Q\` clocking the next stage.
  Watch the stages settle on \`scope.logic\`: they do not switch together, and
  that skew is exactly why synchronous counters exist. \`seq.counter\` is the
  synchronous one.
- **Synchronous counter** — all stages on one clock, with AND gates feeding
  each \`T\` from the bits below it.`,
  title: "T flip-flop",
  shortTitle: "TFF",
  icon: "flip-flop",
  keywords: ["t", "tff", "toggle", "divider", "flip flop", "sequential"],
  inputs: ["t"],
  next: (current, [t]) =>
    t === HIGH ? toggle(current) : t === LOW ? current : X,
});

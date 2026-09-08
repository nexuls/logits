import { HIGH, LOW, X } from "@/lib/sim/logic";
import { bitFlop, toggle } from "./shared";

export const jkFlipFlop = bitFlop({
  type: "seq.jkff",
  docs: `
The JK flip-flop: the one whose two inputs cover hold, set, clear and toggle
between them.

## Behaviour

At each clock edge, \`J\` and \`K\` together decide the next state:

| J | K | Q after the edge |
| :-: | :-: | :-- |
| 0 | 0 | unchanged — hold |
| 1 | 0 | 1 — set |
| 0 | 1 | 0 — clear |
| 1 | 1 | toggled |

The bottom row is what a plain SR latch cannot do: where SR forbids both
inputs at once, JK defines that case as a toggle, and that is the historical
reason the part exists.

There is no controlling value to fall back on, so a \`J\` or \`K\` that cannot
be resolved leaves \`Q\` at \`X\` rather than picking one of the four rows.

Always one bit wide — a JK is a teaching part, and a multi-bit one is a
register with extra steps.

## Typical uses

- Tie \`J\` and \`K\` both high and it toggles on every edge: a divide-by-two,
  the building block of a ripple counter.
- Tie them together and it behaves as a T flip-flop; feed them opposite levels
  and it behaves as a D.
- State machines drawn from a JK excitation table, which is what most textbook
  exercises use it for.`,
  title: "JK flip-flop",
  icon: "flip-flop",
  keywords: ["jk", "jkff", "flip flop", "toggle", "sequential"],
  inputs: ["j", "k"],
  next: (current, [j, k]) => {
    if (j === LOW && k === LOW) return current;
    if (j === HIGH && k === LOW) return HIGH;
    if (j === LOW && k === HIGH) return LOW;
    if (j === HIGH && k === HIGH) return toggle(current);
    // A JK with an unresolved control has no defined next state — unlike an
    // AND gate, there is no controlling value that settles it.
    return X;
  },
});

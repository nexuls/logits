import { HIGH, LOW, X } from "@/lib/sim/logic";
import { bitFlop, toggle } from "./shared";

export const jkFlipFlop = bitFlop({
  type: "seq.jkff",
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

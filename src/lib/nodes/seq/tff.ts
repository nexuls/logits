import { HIGH, LOW, X } from "@/lib/sim/logic";
import { bitFlop, toggle } from "./shared";

export const tFlipFlop = bitFlop({
  type: "seq.tff",
  title: "T flip-flop",
  icon: "flip-flop",
  keywords: ["t", "tff", "toggle", "divider", "flip flop", "sequential"],
  inputs: ["t"],
  next: (current, [t]) =>
    t === HIGH ? toggle(current) : t === LOW ? current : X,
});

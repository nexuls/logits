import { XOR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const xnorGate = symmetricGate({
  type: "gate.xnor",
  title: "XNOR",
  icon: "xnor",
  keywords: ["xnor", "exclusive nor", "equivalence"],
  op: XOR2,
  invert: true,
});

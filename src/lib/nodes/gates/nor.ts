import { OR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const norGate = symmetricGate({
  type: "gate.nor",
  title: "NOR",
  icon: "nor",
  keywords: ["nor", "not or", "universal"],
  op: OR2,
  invert: true,
});

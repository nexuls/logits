import { OR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const orGate = symmetricGate({
  type: "gate.or",
  title: "OR",
  icon: "or",
  keywords: ["or", "disjunction", "|"],
  op: OR2,
});

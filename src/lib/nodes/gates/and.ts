import { AND2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const andGate = symmetricGate({
  type: "gate.and",
  title: "AND",
  icon: "and",
  keywords: ["and", "conjunction", "&"],
  op: AND2,
});

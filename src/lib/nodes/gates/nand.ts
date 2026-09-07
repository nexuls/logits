import { AND2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const nandGate = symmetricGate({
  type: "gate.nand",
  title: "NAND",
  icon: "nand",
  keywords: ["nand", "not and", "universal"],
  op: AND2,
  invert: true,
});

import { symmetricGate } from "./shared";

export const nandGate = symmetricGate("gate.nand", "NAND", "nand", [
  "nand",
  "not and",
  "universal",
]);

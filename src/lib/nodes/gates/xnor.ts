import { symmetricGate } from "./shared";

export const xnorGate = symmetricGate("gate.xnor", "XNOR", "=1○", [
  "xnor",
  "exclusive nor",
  "equivalence",
]);

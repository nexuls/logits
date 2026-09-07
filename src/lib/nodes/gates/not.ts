import { unaryGate } from "./shared";

export const notGate = unaryGate("gate.not", "NOT", "inverter", [
  "not",
  "inverter",
  "invert",
  "!",
]);

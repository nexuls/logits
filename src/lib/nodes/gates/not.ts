import { unaryGate } from "./shared";

export const notGate = unaryGate("gate.not", "NOT", "1○", [
  "not",
  "inverter",
  "invert",
  "!",
]);

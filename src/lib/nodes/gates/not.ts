import { unaryGate } from "./shared";

export const notGate = unaryGate({
  type: "gate.not",
  title: "NOT",
  icon: "inverter",
  keywords: ["not", "inverter", "invert", "!"],
  invert: true,
});

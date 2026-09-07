import { XOR2 } from "@/lib/sim/logic";
import { symmetricGate } from "./shared";

export const xorGate = symmetricGate({
  type: "gate.xor",
  title: "XOR",
  icon: "xor",
  keywords: ["xor", "exclusive or", "^", "parity"],
  op: XOR2,
});

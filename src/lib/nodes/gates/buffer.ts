import { unaryGate } from "./shared";

export const bufferGate = unaryGate("gate.buffer", "Buffer", "buffer", [
  "buffer",
  "buf",
  "repeater",
]);

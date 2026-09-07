import { unaryGate } from "./shared";

export const bufferGate = unaryGate("gate.buffer", "Buffer", "1", [
  "buffer",
  "buf",
  "repeater",
]);

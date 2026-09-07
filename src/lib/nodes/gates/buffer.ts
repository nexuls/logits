import { unaryGate } from "./shared";

export const bufferGate = unaryGate({
  type: "gate.buffer",
  title: "Buffer",
  icon: "buffer",
  keywords: ["buffer", "buf", "repeater"],
});

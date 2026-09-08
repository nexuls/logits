import { registerLike } from "./shared";

export const dFlipFlop = registerLike({
  type: "seq.dff",
  title: "D flip-flop",
  icon: "flip-flop",
  keywords: ["dff", "d flip flop", "latch", "register", "edge", "sequential"],
  hasSet: true,
  hasQn: true,
});

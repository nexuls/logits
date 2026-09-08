import { registerLike } from "./shared";

/**
 * A D flip-flop with no `set` and no `q̅` — the wide, plain storage element.
 * Same code, a different pin set, because they are the same node.
 */
export const registerNode = registerLike({
  type: "seq.register",
  title: "Register",
  icon: "register",
  keywords: ["register", "store", "latch", "word", "sequential"],
  hasSet: false,
  hasQn: false,
});

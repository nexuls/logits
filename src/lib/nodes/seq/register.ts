import { registerLike } from "./shared";

/**
 * A D flip-flop with no `set` and no `q̅` — the wide, plain storage element.
 * Same code, a different pin set, because they are the same node.
 */
export const registerNode = registerLike({
  type: "seq.register",
  docs: `
A word of storage, loaded on the clock edge. The plain, wide version of the D
flip-flop.

## Behaviour

Every bit of \`D\` is captured together on the edge and held on \`Q\` until
the next one. It is the same part as \`seq.dff\` internally, with a different
pin set: no \`SET\`, no \`Q̅\`, because at eight or sixteen bits neither is
what you reach for.

**Bit width** is the size of the word. Changing it rebuilds the circuit, so the
stored value resets — set it before wiring rather than after.

\`EN\` is the pin that makes it a register rather than a pipeline stage: with
\`EN\` low the clock passes and the contents do not change. That is a *load
enable*, and it is how a register file holds a value for many cycles and takes
a new one on the cycle you choose. Unwired, \`EN\` reads as enabled.

## Typical uses

- An accumulator: \`Q\` into a \`comb.alu\` operand, the ALU result back into
  \`D\`, and \`EN\` strobed once per accumulate.
- A program counter, when paired with an adder and a constant of 1 — or use
  \`seq.counter\`, which is that in one part.
- Holding a value read from \`mem.ram\` while the address changes.
- A pipeline register between two combinational stages.`,
  title: "Register",
  shortTitle: "REG",
  icon: "register",
  keywords: ["register", "store", "latch", "word", "sequential"],
  hasSet: false,
  hasQn: false,
});

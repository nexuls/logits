import { registerLike } from "./shared";

export const dFlipFlop = registerLike({
  type: "seq.dff",
  docs: `
The edge-triggered D flip-flop: whatever \`D\` is at the clock edge appears on
\`Q\` and is held there until the next one.

## Behaviour

One bit of memory, sampled at an instant rather than over an interval. That
instant is the whole point — between edges the input can do anything at all
and \`Q\` will not move, which is what makes a chain of these immune to the
glitches that a level-sensitive latch would swallow.

\`Q̅\` is always the inverse of \`Q\`, derived rather than stored, so the two
can never disagree.

**Asynchronous reset** decides when \`RST\` and \`SET\` take effect. On (the
default) they act the moment they are asserted, like a real part's clear pin.
Off, they wait for the clock edge — a synchronous reset, which is what most
designs actually want because it keeps everything on one timebase.

Raise **Bit width** and it stores a whole word on one edge. At that point it is
\`seq.register\` with a \`SET\` pin and a \`Q̅\`.

## Typical uses

- **Divide by two** — wire \`Q̅\` back to \`D\` and the output flips on every
  clock edge, at half the frequency. Chain them for a ripple counter.
- **Shift register** — \`Q\` of each into \`D\` of the next, all sharing one
  clock.
- **Synchroniser** — two in series to bring an asynchronous input safely into
  a clock domain.
- **Pipeline stage** — a flip-flop between two blocks of logic is what lets
  both run in the same cycle.`,
  title: "D flip-flop",
  shortTitle: "DFF",
  icon: "flip-flop",
  keywords: ["dff", "d flip flop", "latch", "register", "edge", "sequential"],
  hasSet: true,
  hasQn: true,
});

import { unaryGate } from "./shared";

export const bufferGate = unaryGate({
  type: "gate.buffer",
  docs: `
Passes \`A\` through to \`Y\` unchanged. It computes nothing — its job is the
propagation delay and the redriving.

## Behaviour

The one thing it does change is a floating input: \`Z\` in becomes \`X\` out,
because a buffer is always driving something and "actively driving nothing" is
not a state it can be in. Known levels pass through untouched.

| A | Y |
| :-: | :-: |
| 0 | 0 |
| 1 | 1 |
| X | X |
| Z | X |

## Typical uses

- Documenting intent on a long run, where the wire alone is unclear.
- Adding a gate delay in a race-condition experiment — though
  \`time.delay\` is the part with an adjustable one.
- Turning a floating net into an explicit \`X\` so the fault shows up on a
  probe instead of hiding.

For a buffer that can also **let go** of its output, use \`gate.tristate\`.`,
  title: "Buffer",
  icon: "buffer",
  view: "block",
  keywords: ["buffer", "buf", "repeater"],
});

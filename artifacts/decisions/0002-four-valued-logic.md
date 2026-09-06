# 0002. Four-valued logic (0, 1, X, Z)

Status: Accepted
Date: 2026-09-06

## Context

Booleans are the obvious representation. But a boolean cannot express an
unconnected input, a bus with no active driver, two outputs fighting, or a
flip-flop that has not been reset — all of which are situations this app exists
to teach.

## Decision

Every bit is one of `0`, `1`, `X` (unknown/conflict), `Z` (high impedance),
stored as a byte per bit-lane in a `Uint8Array`. A documented resolution table
combines multiple drivers on a net. Gates honour controlling values, so an AND
with one `0` input is `0` even if another input is `X`.

## Consequences

- Tri-state buffers, shared buses and bidirectional RAM data pins are expressible.
- Users see red `X` wires when they make a real mistake, instead of a plausible
  wrong answer.
- Cost: ~8× the memory of a bit-packed representation and slower per-bit ops.
  Acceptable at the 2,000-node target; revisit only with a profile.
- Rules out treating a signal as a JS `number` bitmask anywhere in the engine.

# 0009. `Z` is idle on a control pin, and never a clock edge

Status: Accepted
Date: 2026-09-08

Refines [0002](0002-four-valued-logic.md), which fixed the four values but said
nothing about what an *unwired* pin means to the node reading it.

## Context

Every net starts at `Z`, and an unconnected input stays there for the life of
the circuit. That is exactly right for the value on a wire. It turned out to be
badly wrong as an input to the sequential family, in two separate ways, both
found by the first tests written for it.

**An unwired `rst` reset everything, forever.** `seq.dff` asked "is `rst` not
low?" to decide whether an asynchronous clear was asserted. An unwired reset
reads `Z`, which is not low, so a freshly placed flip-flop sat in permanent
reset and `q` never left `X`. The same reasoning would have broken `load` on
the counter and `oe` on the ROM.

**Coming out of `Z` looked like a clock edge.** The first version of
`detectEdge` treated any transition involving a non-`0`/`1` level as
`"unknown"`. Every net in every circuit starts at `Z` and is then driven to
`0` or `1` by whatever is upstream, so *every* clocked node in *every*
document saw a spurious ambiguous edge a nanosecond after `t = 0` and latched
`X`. A one-shot fired on power-up.

The tempting fix — treat `Z` as `0` everywhere — is worse. It would make a
floating tri-state bus read as a solid low, which is the exact confusion
four-valued logic exists to prevent, and it would make `undriven-input` a lie.

## Decision

`Z` keeps its meaning on a *net*. What changes is what a node reading it
concludes, and the two rules are written once rather than per node.

**On a control pin, `Z` is idle.** `controlState` in
[`src/lib/nodes/shared.ts`](../../src/lib/nodes/shared.ts) maps a level to
`"asserted"` / `"idle"` / `"unknown"`: `1` asserts, `0` and `Z` are idle,
and `X` — a genuinely contended control — is unknown. Every `rst`, `set`,
`load` and `oe` goes through it. The rule is that "not wired" and "not
asserted" are the same thing to the part.

`en` is the one control whose idle meaning is the opposite, so it does not go
through `controlState`: an unwired enable *enables*, and only a pin actually
held low disables. That is stated at each of the three places it matters
rather than hidden in a helper, because it is the exception.

**A transition into or out of `Z` is not an edge.** `detectEdge` in
[`src/lib/nodes/edges.ts`](../../src/lib/nodes/edges.ts) returns `"none"` when
either level is `Z`: high impedance is "nothing has driven this yet", not "some
level nobody can name". `X` is the other thing entirely and still returns
`"unknown"`, which is what puts `X` on `q` when a clock is contended.

## Consequences

A flip-flop with nothing wired to `rst`, `set` or `en` behaves like the
datasheet part with those pins tied off, which is what a user drawing one
expects.

A genuinely floating clock now clocks nothing at all, silently. The netlist's
`undriven-input` warning is the only thing that says so, which makes that
warning load-bearing rather than advisory.

A circuit whose reset is driven by a tri-state bus that everyone has released
will not reset — it reads `Z`, which is idle. That is a real hardware bug the
simulator now reproduces rather than papers over, but it will read as a
simulator bug to someone who has not read this file.

`X` on a control is still contagious: it produces `X`, not a guess. Nothing
here softens that.

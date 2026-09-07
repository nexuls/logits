# 0005. An oscillation is churn at one instant, not a large event count

Status: Accepted
Date: 2026-09-07

Refines [0001](0001-event-driven-simulation.md), which established the event
budget but not what exceeding it means.

## Context

ADR 0001 bounds each `runUntil` with an event budget and says exceeding it
raises an `oscillation` diagnostic. Implementing the runner exposed that this
conflates two different circuits:

- A **ring oscillator at 1 ns a stage** is doing exactly what it was built to
  do. Its simulated clock advances; it just produces a lot of events. Under a
  count-only rule, running it fast enough gets it condemned as broken — and the
  faster the user's machine, the sooner. The runner spec already says the
  opposite for this case: report the achieved rate, do not freeze.
- A **combinational loop of zero-delay nodes** feeds itself at a single
  timestamp. Simulated time can never advance, so no budget, however large,
  would ever let it finish. This is the case that would lock the tab.

Only the second is a fault in the user's circuit. A count alone cannot tell
them apart, because the first can produce any number of events you like.

## Decision

Two separate limits, with two different meanings.

| Limit | Meaning when reached |
| --- | --- |
| `MAX_EVENTS_PER_ADVANCE` (and any smaller budget the caller passes) | **Yield.** `settled: false`, no diagnostic. Simulated time stops where it got to and the caller resumes. |
| `MAX_EVENTS_PER_INSTANT` — events at one timestamp | **Oscillation.** Diagnostic naming the most-active nets, those nets forced to `X`, queue cleared. |

The runner passes its per-frame budget as the caller budget, so a frame always
returns; it pauses only on a true oscillation, and otherwise reports
`achievedNsPerSecond` below the requested speed.

## Consequences

- A working oscillator is never accused of oscillating, at any speed, on any
  machine. Determinism is preserved: the verdict depends on the circuit, not on
  how much the caller asked for in one go.
- The guarantee that the tab cannot hang is unchanged, and now rests on the
  condition that actually causes hanging.
- A zero-delay combinational loop is reported the moment it churns, rather than
  after a budget's worth of wasted work.
- Cost: a circuit whose reset genuinely produces more than
  `MAX_EVENTS_PER_INSTANT` simultaneous events would be misreported. That is
  ~25× the simultaneous events a 2,000-node reset produces, so the headroom is
  real, but it is a ceiling and not a proof.

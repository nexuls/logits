# 0001. Event-driven simulation with propagation delay

Status: Accepted
Date: 2026-09-06

## Context

Three simulation models were available: (a) recompute all gates on every change
until stable, (b) levelized evaluation in topological order, (c) discrete-event
simulation with a time-ordered queue.

(a) and (b) both assume a combinational DAG. This app must support clocks,
edge-triggered flip-flops, oscilloscopes with a time axis, ring oscillators, and
feedback loops — none of which have a topological order or a meaningful notion of
"settled" without time.

## Decision

Discrete-event simulation. Integer nanosecond timestamps, a binary min-heap
ordered by `(time, sequence)`, per-node propagation delay defaulting to 1 ns.

## Consequences

- Clocks, one-shots and delays are ordinary nodes, not engine special cases.
- Waveform capture is natural: events already carry timestamps.
- Feedback loops work, and oscillators oscillate instead of hanging — bounded by
  an event budget per advance that raises an `oscillation` diagnostic.
- Cost: a purely combinational circuit is slower than levelized evaluation, and
  authors must think about delay. Accepted; correctness and teachability win.
- Determinism depends on the sequence counter. Any ordering derived from object
  iteration or ids would break reproducibility.

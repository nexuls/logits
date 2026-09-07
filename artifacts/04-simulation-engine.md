# Simulation engine

Lives in `src/lib/sim/`. Pure TypeScript, no React, no DOM, no wall-clock reads.

## Logic values

Four-valued logic, one byte per bit-lane:

```ts
export const LOW = 0;    // 0
export const HIGH = 1;   // 1
export const X = 2;      // unknown / conflict
export const Z = 3;      // high impedance (undriven)
```

A signal of width `w` is a `Uint8Array(w)`, index 0 = LSB. Helpers in
`src/lib/sim/logic.ts`: `toBits`, `fromBits`, `isKnown`, `resolve`, `and2`,
`not1`, … Never encode a value as a JS `number` bitmask; you lose `X`/`Z`.

**Driver resolution** (applied per bit when a net has several drivers):

| A \ B | 0 | 1 | X | Z |
| --- | --- | --- | --- | --- |
| **0** | 0 | X | X | 0 |
| **1** | X | 1 | X | 1 |
| **X** | X | X | X | X |
| **Z** | 0 | 1 | X | Z |

Any gate with an `X` or `Z` input produces `X`, except where the gate has a
controlling value (AND with a `0` input is `0`; OR with a `1` input is `1`).
Implement the controlling-value shortcut — without it, an unconnected input
turns half the circuit unknown and the app feels broken.

## Time

Integer **nanoseconds** stored as a JS `number`. Never floats, never `Date.now()`
inside the engine. Default propagation delay is 1 ns per gate; nodes may declare
their own. Zero-delay nodes are allowed but combinational loops of them are not
— see the oscillation budget.

## Event-driven core

```
while (queue.peek().time <= untilTime) {
  event = queue.pop();
  now = event.time;
  applyNetChange(event);          // write value, mark net dirty
  for (reader of netReaders[net]) schedule(reader.evaluate, now + reader.delay);
}
```

- **Queue**: binary min-heap in `src/lib/sim/queue.ts`, ordered by
  `(time, sequence)`. The monotonically increasing sequence number is what makes
  the simulation deterministic — never order by insertion into a `Map` or by
  node id.
- **Coalescing**: scheduling the same node at the same time replaces the pending
  event rather than queueing twice.
- **Settling**: `runUntil(t)` returns when the queue has no event at or before
  `t`. `step()` advances to the next event time. `stepCycle()` advances to the
  next edge of the designated primary clock.
- **Oscillation budget**: at most `MAX_EVENTS_PER_ADVANCE` (start at 100_000)
  events per `runUntil` call. Exceeding it stops the run, emits an
  `oscillation` diagnostic naming the most-active nets, and leaves them `X`.
  It must never hang the tab.

## Node evaluation contract

```ts
type EvalContext<P, S> = {
  now: number;                      // ns
  params: P;
  state: S;                         // mutable, node-owned, survives between calls
  read(pinId: string): Uint8Array;  // resolved value of the net on that pin
  write(pinId: string, value: Uint8Array, delayNs?: number): void;
  scheduleSelf(delayNs: number): void;   // clocks, one-shots
  emitSample?(channel: string, value: Uint8Array): void;  // instruments
};
```

Rules for `evaluate`:

1. **Pure with respect to everything except `state` and `write`.** No module-level
   mutable variables, no `Math.random`, no `Date`, no DOM.
2. Called once per input change (after the node's delay) and once at reset.
3. Writing the same value it already wrote is free — the engine drops no-op
   changes before scheduling, so idempotent writes are the normal case.
4. Edge-triggered nodes detect edges by comparing against the previous clock
   value they stored in `state`. The engine does not classify edges for you.
5. A node must not read another node's state or reach into the netlist.

## Reset

`reset()` clears the queue, sets every net to `Z` (then propagates), re-creates
node state via `createState`, and evaluates every node once at `t = 0`. Flip-flops
come up `X`, not `0` — the same as real hardware, and it teaches users to add a
reset line.

## Runner

`src/lib/sim/runner.ts` is the only part that touches `requestAnimationFrame`.

- Modes: `running`, `paused`, `stepping`.
- Speed is a **simulated-time-per-real-second** factor (e.g. `1 MHz`), clamped so
  a frame never simulates more than a fixed event budget. When the budget is hit,
  report the achieved rate in the UI rather than freezing.
- Each frame: `runUntil(simTime + dt * speed)`, then bump the version counter
  once and notify subscribers. One notification per frame, never per event.
- The runner is the only writer of simulation state that React observes.

## Instruments

- **Oscilloscope / logic analyser** samples on net change into a fixed-capacity
  ring buffer (`src/lib/sim/waveform.ts`) storing `(time, value)` pairs per
  channel. Capacity is bounded; oldest samples drop. The scope node's view draws
  the ring buffer straight to a `<canvas>`.
- **Clock** is an ordinary node that calls `scheduleSelf(halfPeriodNs)` and
  toggles. It is not special-cased in the engine.

## Testing

The engine is the part of this app that is worth testing properly. Every node
definition ships with a truth-table or waveform test. Vitest is configured
(`bun run test`); tests sit beside the code as `*.test.ts` and run in the `node`
environment, which the pure domain layer needs nothing more than.

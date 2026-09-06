# Product spec

**Logits** is a browser app for designing and simulating digital logic on an
infinite canvas. Everything on the canvas is a *node*; nodes have *pins*; pins
are joined by *wires*; a simulation engine propagates values through them in
time.

## Core loop

1. Drag a node from the palette onto the canvas (or place it with the command menu).
2. Drag from an output pin to an input pin to wire them.
3. The simulation runs continuously; toggle inputs, watch outputs light up.
4. Instrument the circuit — clocks drive it, scopes and displays read it.
5. Save / load / share the circuit as a JSON document.

## What "node" means

A node is a **reusable definition** plus a **placed instance**. The definition
declares pins, parameters, appearance, and behaviour; the instance carries
position, parameter values, and runtime state. Adding a new kind of node must
never require touching the canvas, the engine, or the palette — only adding a
definition file and registering it. This is the single most important product
constraint; see [05-node-authoring-guide.md](05-node-authoring-guide.md).

## Node families

| Family | Examples |
| --- | --- |
| Gates | AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer, tri-state buffer |
| Sources / sinks | toggle switch, push button, constant, LED, probe |
| Timing | clock, monostable (one-shot), delay |
| Sequential | D / JK / T flip-flop, latch, register, counter |
| Combinational blocks | mux, demux, decoder, encoder, adder, comparator, ALU |
| Memory | ROM, RAM |
| Instruments | oscilloscope / logic analyser, 7-segment display, hex display, bus probe |
| Structure | bus splitter/merger, tunnel (named net), subcircuit (user-defined chip) |

The agreed pin layout and parameters for each live in
[06-node-catalog.md](06-node-catalog.md). Do not invent a different pin order
for a node the catalog already specifies.

## Requirements that shape the design

- **Multi-bit signals.** A pin has a width (1..64). Buses are first class, not
  bundles of single wires.
- **Four-valued logic.** `0`, `1`, `X` (unknown/conflict), `Z` (high impedance).
  Tri-state buffers, buses and uninitialised flip-flops are unusable without it.
- **Real time behaviour.** Clocks, edge-triggered devices and scopes need a
  timeline, not a "recompute everything on change" model. Gates have propagation
  delay. See [04-simulation-engine.md](04-simulation-engine.md).
- **Large circuits stay smooth.** Target: 2,000 nodes placed, 60 fps pan/zoom,
  simulation decoupled from React rendering.
- **Deterministic.** The same circuit and the same inputs produce the same
  waveform every run. No `Math.random`, no wall-clock reads inside the engine.
- **Local-first.** A circuit is a plain JSON document. It round-trips through
  the filesystem and `localStorage` with no server.

## Out of scope (say no to these)

- Analog simulation, transistor-level modelling, SPICE.
- HDL import/export (Verilog/VHDL) — may be reconsidered after v1.
- Real-time multiplayer collaboration.
- Accounts, a backend, or anything that requires a database.

## Non-goals worth stating

- Not a schematic-capture tool for PCBs; wires carry logic, not nets with DRC.
- Not a teaching-content platform; no lessons, no grading.

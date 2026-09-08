# 0010. A subcircuit is a node type derived from the document

Status: Accepted
Date: 2026-09-08

## Context

The catalog planned `sub.instance`, a single node type whose pins came from
"the subcircuit's port nodes". Writing it exposed the problem: a definition's
pins come from `pins(params)`, and `params` is all it gets. A `sub.instance`
node would have to carry its chip's whole interface — pin ids, names,
directions, widths — in its own params to have anything to draw.

That is derived data in the document, which the authoring guide lists as an
anti-pattern, and it has teeth: editing a chip's ports would leave every
existing instance holding a stale copy of the old interface, needing either a
migration or a resync pass that nothing else in the codebase has.

There is a second, quieter problem. `buildNetlist` has to inline instances, and
`sub.port` has to be recognised as a boundary. Doing either by comparing
`node.type` to a string would break Non-negotiable #4 in the one file that most
needs to stay generic.

## Decision

**A chip is a node type.** An instance's `type` is `sub.<key>`, where `key`
indexes `document.subcircuits`. There is no `sub.instance` in the registry.

**The lookup is derived from the document, not built into the app.**
`subcircuitLookup(document, lookupNode)` in
[`src/lib/circuit/subcircuit.ts`](../../src/lib/circuit/subcircuit.ts) wraps the
registry and synthesizes a `NodeDefinition` for each chip, reading its pins off
that chip's `sub.port` nodes at lookup time. The editor and the simulation
store both take their `NodeLookup` from there, so the pins the canvas draws and
the pins the netlist ties up come from one function. Editing a chip changes
every instance of it with no migration, because nothing was cached.

**Instances are inlined before the netlist is compiled.** `flattenDocument`
replaces each instance with a prefixed copy of the chip's nodes and wires
(`<instance>/<inner>`) and re-points the parent's wires at the corresponding
port node. The engine therefore never learns that subcircuits exist: it runs
one flat netlist, and a gate inside a chip costs exactly what the same gate
costs at the top level.

**Both halves are found through the definition contract, never by type.**
`NodeDefinition` gains `subcircuit(params)` — "which chip am I an instance
of" — and `boundaryPort(params)` — "which pin of the instance do I stand for".
Only the synthesized definitions answer the first, and only `sub.port` answers
the second. This is the same shape as `netAliases`, which is how `bus.tunnel`
joins nets by name without `buildNetlist` knowing what a tunnel is.

**A port's own pin is `inout`.** It is a join, not a driver. An input port
declared as an output would, once inlined, land on the same net as the parent's
driver and be reported as a two-driver short. The direction the *instance*
shows is declared separately in `boundaryPort`, which is what keeps a chip's
inputs on its left.

**The chip library is flat and lives on the root document.** A chip may
instantiate another chip, but all of them are defined once in the top-level
`subcircuits`, so editing one updates every user of it rather than every copy
needing to be found. Nesting is bounded at `MAX_SUBCIRCUIT_DEPTH`, and
exceeding it is a `subcircuit-recursion` diagnostic rather than a stack
overflow.

## Consequences

`sub.<key>` is in the save format, so renaming a chip's key is a breaking
change needing a migration in `io.ts`, exactly like renaming a node type.

Node ids in the netlist are no longer document node ids: an inlined node is
`chip/gate`. Anything that maps a diagnostic back to something the user can
click has to cope with an id that names a node inside a chip, which nothing on
the canvas currently draws.

An instance's own pins do not appear in the netlist — they were replaced by the
port nodes' pins — so `pinToNet` has no entry for them and the canvas shows no
value on an instance's pins. The wires either side of it still show theirs.
Fixing it means the scene mapping an instance pin to its port's net.

There is no UI yet for creating a chip from a selection or opening one to edit,
so nothing in the app can produce a `sub.<key>` node today. The model,
the flattening and the simulation are done and tested; the authoring surface is
the remaining piece, and it is the reason the roadmap's subcircuit box is not
ticked.

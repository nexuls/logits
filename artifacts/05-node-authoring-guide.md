# Node authoring guide

**Read this before adding any node.** Adding a node must touch exactly two
places: a definition file, and the registry list. If you find yourself editing
the canvas, the engine, the palette, or the inspector to make a node work, stop
— the abstraction is wrong and that is the bug to fix.

## The definition

```ts
// src/lib/nodes/gates/and.ts
import { defineNode } from "@/lib/nodes/define";

export const andGate = defineNode({
  type: "gate.and",                 // "<family>.<name>", stable forever
  title: "AND",
  category: "gates",                // must be listed in `nodeCategories`
  kind: "basic",                    // pins readable from the shape, so the
                                    // canvas leaves their names off by
                                    // default — omit for "compound"
  keywords: ["and", "conjunction", "&"],
  docs: `…`,                        // Markdown help for the palette's info
                                    // dialog — see "Documenting a node" below
  icon: "and",                      // palette icon *name*, resolved by
                                    // src/components/nodes/node-icons.tsx —
                                    // a string, never a component: no React here
  view: "block",                    // body renderer *name*, resolved by
                                    // src/components/nodes/node-views.tsx —
                                    // "block" is the labelled rectangle every
                                    // element gets until it has a real symbol
  defaultParams: { inputs: 2, width: 1 },
  paramsSchema: [
    { key: "inputs", label: "Inputs", kind: "int", min: 2, max: 8 },
    { key: "width",  label: "Bit width", kind: "int", min: 1, max: 64 },
  ],
  pins: ({ inputs, width }) => [
    ...range(inputs).map((i) => ({
      id: `in${i}`, name: `A${i}`, direction: "in" as const,
      width, side: "left" as const, offset: i * 2,
    })),
    { id: "out", name: "Y", direction: "out", width, side: "right", offset: 1 },
  ],
  size: ({ inputs }) => ({ width: 6, height: Math.max(4, inputs * 2) }),
  delayNs: () => 1,                 // omit entirely for the 1 ns default
  evaluate: (ctx) => {
    const values = range(ctx.params.inputs).map((i) => ctx.read(`in${i}`));
    ctx.write("out", combine(values, width, AND2));
  },
});
```

The gate families are already factored: `symmetricGate` and `unaryGate` in
[gates/shared.ts](../src/lib/nodes/gates/shared.ts) take a bit table and an
`invert` flag, so AND and NAND differ by one line and the pin ids — which are
save format — are written once. Reach for `combine` from
[sim/logic.ts](../src/lib/sim/logic.ts) before writing a bit loop by hand.

Look for an existing helper before writing geometry or a param clamp:

| You need | Use |
| --- | --- |
| A "Bit width" stepper, a clamped `width`, pin stacking, body height | [nodes/shared.ts](../src/lib/nodes/shared.ts) |
| Room a name takes on a body, and the gutters its pin labels eat | [nodes/label-metrics.ts](../src/lib/nodes/label-metrics.ts) |
| To know whether a clock moved, four-valued | `detectEdge` in [nodes/edges.ts](../src/lib/nodes/edges.ts) |
| To read `rst` / `set` / `load` / `oe` | `controlState` in [nodes/shared.ts](../src/lib/nodes/shared.ts) |
| A reset/enable/clock frame around a stored value | `registerLike` / `bitFlop` in [seq/shared.ts](../src/lib/nodes/seq/shared.ts) |
| Four-valued addition | `addSignals` in [comb/arith.ts](../src/lib/nodes/comb/arith.ts) |

`controlState` and `detectEdge` are not conveniences — they carry the rules in
[ADR 0009](decisions/0009-z-is-idle-on-a-control-pin.md) about what an unwired
pin means. Re-deriving them by hand is how you get a flip-flop stuck in reset.

Then add it to `src/lib/nodes/registry.ts`. The registry is an **explicit
array** — never rely on import side effects or filesystem globbing, both of
which break tree-shaking and make ordering non-deterministic.

## Checklist for a new node

- [ ] `type` follows `family.name`, lowercase, dot-separated, and is never renamed.
- [ ] Pin `id`s are stable and descriptive (`d`, `clk`, `q`, `qn`, `en`) — they
      are in the save format.
- [ ] Pin layout matches [06-node-catalog.md](06-node-catalog.md) if the node is listed there.
- [ ] Inputs on the left, outputs on the right, clock on the bottom, enable/reset
      on the top. Deviate only with a reason in the ADR log.
- [ ] Handles `X` and `Z` inputs sensibly; implements controlling values where
      they apply (see [04-simulation-engine.md](04-simulation-engine.md)).
- [ ] Works at any `width` it advertises, not just 1.
- [ ] An output that can drive `Z` is marked `tristate: true` on its `PinSpec`.
      Without it `buildNetlist` calls a legitimate shared bus a
      `multiple-drivers` short — and it must never learn your node's `type` to
      work that out for itself.
- [ ] `size()` is in grid units and leaves room for every pin.
- [ ] Every configurable param has a `paramsSchema` entry, so the inspector can
      offer it. The `kind` picks the control (`int` — a stepper, `bool`, `text`,
      `select`, `color` — a row of swatches); never edit the inspector to add a
      node. A `color` option carries a `swatch` CSS colour, and the node's own
      view reads it back through `colorParam`, so the palette is declared once
      in the definition rather than duplicated in the view.
- [ ] Stateful nodes implement `createState`; state is JSON-serialisable and
      never holds DOM refs or closures. It is re-created on every reset, so a
      latched value must not survive one.
- [ ] `evaluate` writes only pins the definition declares as outputs, and
      writes exactly the pin's width. The engine pads a short write with `Z`
      rather than corrupting the net, but that is a safety net, not a licence.
- [ ] Has a test: truth table for combinational, waveform for sequential.
      [src/test/circuit.ts](../src/test/circuit.ts) has both harnesses —
      `evaluateOnce` for a table, `engineFor` for a real circuit with a real
      clock. Anything with `state` is tested the second way: a flip-flop that
      latched on the wrong edge would pass every static check.
- [ ] Declares `kind: "basic"` **only** if its pins are obvious from where they
      sit; otherwise leave `kind` off and let the canvas label it. See "Basic or
      compound" below.
- [ ] Declares `pinLabels: "floating"` if its body is the thing being read — a
      switch, an LED, a keypad — so a pin name never covers its own view. See
      "Basic or compound" below.
- [ ] Names a `view` — `"block"` unless it has a symbol or a readout of its own.
- [ ] Has a `shortTitle` if `title` is longer than the abbreviation a schematic
      would use for it. See "Names, and the body that has to hold one".
- [ ] Has a `docs` string. The palette's info button is driven straight off it,
      so a node without one ships with no help at all — see below.
- [ ] Appears in the palette with a sensible `icon` and `keywords`, under a
      `category` that `nodeCategories` in the registry knows about. The palette
      reads all of that off the definition — never edit the palette to add a node.
      Reuse an existing icon name where the shape fits; a genuinely new shape is
      a third file, `node-icons.tsx`, and it is keyed by shape, never by `type`.

## Basic or compound

`kind` says whether a reader can tell this node's pins apart by looking at it.

- **`"basic"`** — one pin to a side, or a row of interchangeable inputs: a
  switch, an LED, an AND gate, a tri-state buffer whose enable is the only pin
  on its top edge. Where the pin is says which one it is.
- **`"compound"`** — several pins on one edge doing different jobs: `D` against
  `CLK`, `Y0` against `Y1`. Only the name tells them apart. **This is the
  default**, and omitting `kind` is how you get it, because a node whose author
  never considered the question is likelier to need its names shown than not.

The canvas draws pin names for compound nodes and not for basic ones, and each
kind has its own switch in the editor settings so either can be forced. That is
all `kind` does — it is never read by the netlist, the engine or the save
format, and no component holds a list of which types are which
(Non-negotiable #4).

`registry.test.ts` fails a node that calls itself basic while putting two
differently-named pins on one edge, so the claim cannot quietly rot as a
definition grows pins.

### Inline or floating

`kind` says *whether* the names are drawn; `pinLabels` says **where**.

- **`"inline"`** (the default) writes each name inside the body, against the
  edge its pin ended up on, and the body reserves a gutter for it. Right for a
  part whose body is a labelled rectangle with room to spare.
- **`"floating"`** hangs the name outside the body instead, and draws it only
  while the node is hovered or selected. It reserves nothing, so the view keeps
  its whole body. This is what the `io.*` sources and sinks use: on an element
  four cells across, an inline `Q` covers the very lamp or switch face the user
  is reading, and a name that is only there when you point at it costs nothing
  when you are not.

A floating element answers to neither `kind` switch: it carries no names until
it is pointed at, so there is nothing for the switches to be about. That also
keeps a floating element that never declared a `kind` — `io.keypad` — from
falling into the compound default, which is on, and being always-labelled after
all.

Hover is hit-tested against the scene in
[use-editor-gestures.ts](../src/components/editor/use-editor-gestures.ts), not
read off a DOM `:hover`, because node bodies take no pointer events — and
selection reveals them too, which is the keyboard path to the same thing.

## Documenting a node

Every entry in the palette has an info button, and it opens
[node-docs-dialog.tsx](../src/components/editor/node-docs-dialog.tsx) rendering
that definition's `docs` — Markdown, on the definition itself, not a `.md` file
beside it, because adding a node still has to touch exactly two files. It is a
string and not JSX for the same reason `icon` and `view` are names: this layer
may not import React. GFM is on, so tables work.

**Do not restate the pins or the parameters.** The dialog derives both tables
from `pins(defaultParams)` and `paramsSchema`, so they cannot drift from the
element the canvas actually draws. Prose that repeats them can.

What a good page covers, roughly in this order:

1. A one-line answer to "what is this".
2. `## Behaviour` — what it computes, and what it does at the edges: which
   value is *controlling*, what an unresolved input produces, what an unwired
   control pin means.
3. `## Typical uses` — the circuits it is actually for. This is the section
   that turns a catalog into something you can learn from.
4. `## On the canvas` — placing it, wiring it, and anything about the
   inspector that is not obvious.

Where a whole family shares a section, factor it out rather than writing it
nine times: `SHARED_GATE_DOCS` in [gates/shared.ts](../src/lib/nodes/gates/shared.ts)
and `SHARED_CLOCKED_DOCS` in [seq/shared.ts](../src/lib/nodes/seq/shared.ts) are
appended by the factories, so a gate file documents what makes it that gate and
nothing more.

`registry.test.ts` checks that every definition has one and that its code spans
are balanced — an escaped backtick lost inside a template literal renders as a
run of literal backticks and is invisible until someone opens the dialog.

## When a node is more than pins and an `evaluate`

Three optional hooks on `NodeDefinition` let a node do something structural
without any other file learning its `type`. Each is answered by exactly one
family today, and each is the reason a rule in `AGENTS.md` still holds:

- **`netAliases(params)`** — pin id to net *name*. Every pin naming the same net
  is merged into one net with no wire between them. `bus.tunnel` is the only
  user; `buildNetlist` applies it without knowing what a tunnel is.
- **`subcircuit(params)`** — "which chip am I an instance of". Only the
  definitions synthesized by
  [circuit/subcircuit.ts](../src/lib/circuit/subcircuit.ts) answer.
- **`boundaryPort(params)`** — "which pin of the instance do I stand for",
  inside a chip. Only `sub.port` answers. See
  [ADR 0010](decisions/0010-subcircuits-are-derived-node-types.md).

If a node needs something structural that none of these covers, the fix is a
fourth hook on the contract, not a `type` comparison in the netlist.

## How a node is drawn

**Every node names a `view`**, and most of them name the same one:

```ts
view: "block",     // a *name*, resolved by src/components/nodes/node-views.tsx
```

`"block"` is [block-view.tsx](../src/components/nodes/block-view.tsx) — a
rectangle with the element's name in it, which is what the whole catalog is
drawn as until someone designs it a real symbol. Declaring it rather than
leaving `view` off is deliberate: `grep 'view: "block"' src/lib/nodes` is the
list of elements still waiting for one.

Reach for a different view when the node displays data or takes a click —
scope, 7-segment, hex readout, LED, switch — or when you are drawing the
element's actual symbol. Either way it is a component in
`src/components/nodes/` plus one line in
[node-views.tsx](../src/components/nodes/node-views.tsx), which is the one
place that maps names to components. `view` is a string for the same reason
`icon` is: this layer may not import React.

The keys name a **behaviour or a shape** — `"toggle"`, `"lamp"`, `"readout"`,
`"block"` — never a node `type`. The probe and the constant share `"readout"`;
two gates that differ only by a bubble should share one outline, not own two.

Views receive `NodeViewProps`:

| prop | what it is for |
| --- | --- |
| `node`, `def` | the node and its definition |
| `resolved` | geometry with rotation applied — `bounds` in world units, `pins` on the edges they actually ended up on |
| `orientation` | `"vertical"` after a quarter turn; a symbol with a direction draws itself along this |
| `showPinLabels` | whether the canvas is drawing this element's pin names right now |
| `readPin`, `setParams`, `interactive` | the value on a pin, an edit through a command, and whether input goes anywhere |

A view must:

- subscribe only to the nets they display (see the boundary rules in
  [02-architecture.md](02-architecture.md));
- draw with `<canvas>` or SVG if they update every frame — not React state;
- stay interactive at any zoom (they live inside the transformed layer);
- **read fine at every rotation.** It is handed `orientation` and post-rotation
  pin sides; a symbol that ignores them is a symbol that lies about which way
  the signal flows;
- keep pointer events off the node body except on genuinely interactive parts,
  so dragging the node still works. An interactive part also has to
  `stopPropagation` on `pointerdown`, or the click starts a move gesture
  instead — see [toggle-view.tsx](../src/components/nodes/toggle-view.tsx).

## Names, and the body that has to hold one

Two `title`s, and they are for different readers:

- **`title`** — what the palette, the inspector and the docs dialog call it:
  `"Demultiplexer"`.
- **`shortTitle`** — what the *canvas* writes on the body, where the
  conventional abbreviation is both what fits and what a reader of a schematic
  expects: `"DEMUX"`, `"DFF"`, `"REG"`. Omit it for a name that is already
  short.

You do not size a body against its name by hand. `defineNode` measures the
name against the body and the gutters the pin labels occupy, and widens — or
raises — the footprint until the name is set on **one line at 8px or larger**,
moving the pins on the growing edges by half the growth so a centred `CLK`
stays centred. The metrics are in
[label-metrics.ts](../src/lib/nodes/label-metrics.ts) and `registry.test.ts`
checks the promise at all four rotations.

`block-view.tsx` then reads the same numbers to decide **which way the name
runs**: along whichever axis has the clear room, so a body that is tall —
whether authored tall like an 8-line encoder, or turned on its side — writes
its name downwards instead of hyphenating it into syllables. That is the whole
of the horizontal/vertical rule; there is no third variant and no per-node
tuning.

## Interactive nodes (switches, buttons)

User input goes into node **params** through a command, so undo, autosave and
the save file all see it. A switch's `evaluate` reads `params.value`; the click
handler calls `setParams({ value })`, which goes through
`updateNodeParams` → the document store → `syncDocument`, and from there to
`engine.setNodeParams`. A view must never call `ctx.write` or touch the engine
itself.

Params rather than `state`: a switch's position is part of the circuit and has
to survive a reload and undo with everything else, whereas `state` is re-created
on every reset by design. Reserve `state` for what a reset should forget — a
latched value, a counter.

Note which params are *not* structural. `syncDocument` rebuilds the engine only
when the pins, the wiring or a `delayNs` change; a param that only `evaluate`
reads is pushed into the running engine instead, which is what lets a switch be
flipped mid-run without wiping the circuit's state.

## Naming and file layout

```
src/lib/nodes/
  define.ts          defineNode(), types, param readers
  registry.ts        explicit array of every definition
  shared.ts          pin stacking, width params, controlState
  edges.ts           four-valued clock-edge detection
  gates/and.ts       one node per file, kebab-case filenames
  timing/clock.ts
  seq/shared.ts      the reset/enable/clock frame
  comb/arith.ts
  instruments/scope.ts
```

## Anti-patterns

- Special-casing a node type by string comparison anywhere outside its own file.
- Storing derived values (pin positions, sizes) in the document.
- A node that reads the whole netlist or another node's state.
- A node whose behaviour depends on evaluation order rather than on events.
- Copy-pasting a gate to change one operator instead of parameterising it.

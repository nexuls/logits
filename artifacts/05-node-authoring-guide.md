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
  keywords: ["and", "conjunction", "&"],
  icon: "and",                      // palette icon *name*, resolved by
                                    // src/components/nodes/node-icons.tsx —
                                    // a string, never a component: no React here
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
- [ ] Appears in the palette with a sensible `icon` and `keywords`, under a
      `category` that `nodeCategories` in the registry knows about. The palette
      reads all of that off the definition — never edit the palette to add a node.
      Reuse an existing icon name where the shape fits; a genuinely new shape is
      a third file, `node-icons.tsx`, and it is keyed by shape, never by `type`.

## When a node needs custom rendering

Most nodes are drawn by the generic renderer from `size()`, `title` and pins.
Only reach for a custom `view` when the node genuinely displays data — scope,
7-segment, hex readout, LED, switch.

```ts
view: "readout",   // a *name*, resolved by src/components/nodes/node-views.tsx
```

`view` is a string for the same reason `icon` is: this layer may not import
React. [node-views.tsx](../src/components/nodes/node-views.tsx) is the one place
that maps names to components, and the keys name a **behaviour** — `"toggle"`,
`"lamp"`, `"readout"` — never a node `type`. The probe and the constant share
`"readout"`; a genuinely new behaviour is a component beside it and one line in
that map.

Views are React components in `src/components/nodes/`. They receive
`NodeViewProps` — `{ node, def, readPin, setParams, interactive }` — and must:

- subscribe only to the nets they display (see the boundary rules in
  [02-architecture.md](02-architecture.md));
- draw with `<canvas>` or SVG if they update every frame — not React state;
- stay interactive at any zoom (they live inside the transformed layer);
- keep pointer events off the node body except on genuinely interactive parts,
  so dragging the node still works. An interactive part also has to
  `stopPropagation` on `pointerdown`, or the click starts a move gesture
  instead — see [toggle-view.tsx](../src/components/nodes/toggle-view.tsx).

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
  define.ts          defineNode(), types
  registry.ts        explicit array of every definition
  gates/and.ts       one node per file, kebab-case filenames
  timing/clock.ts
  instruments/oscilloscope.ts
```

## Anti-patterns

- Special-casing a node type by string comparison anywhere outside its own file.
- Storing derived values (pin positions, sizes) in the document.
- A node that reads the whole netlist or another node's state.
- A node whose behaviour depends on evaluation order rather than on events.
- Copy-pasting a gate to change one operator instead of parameterising it.

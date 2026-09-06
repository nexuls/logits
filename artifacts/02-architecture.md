# Architecture

## Layers

```
                 ┌──────────────────────────────────────────┐
  React / DOM    │ src/app, src/components/editor, /canvas   │
                 └───────────────┬──────────────────────────┘
                                 │ subscribe (useSyncExternalStore)
                 ┌───────────────┴──────────────────────────┐
  Stores         │ src/state — document, selection, history,  │
                 │              viewport, sim controls        │
                 └───────────────┬──────────────────────────┘
                                 │ plain function calls
                 ┌───────────────┴──────────────────────────┐
  Domain (pure)  │ src/lib/circuit  model + netlist + io      │
                 │ src/lib/sim      engine + runner           │
                 │ src/lib/nodes    node definitions/registry  │
                 └──────────────────────────────────────────┘
```

**The domain layer must not import React, `next/*`, or anything DOM-specific**
(except node `view` components, which live in `src/components/nodes/` — the
definition references them, it does not contain them). A node's `evaluate`
function must be callable from a plain Node.js test with no DOM.

Dependencies point downward only. If a lower layer needs something from an upper
one, that is a design error — pass it in as an argument.

## Directory layout

| Path | Contents | Status |
| --- | --- | --- |
| `src/app/` | Next.js App Router entry. The editor is one route; keep page files thin. | Built (still the starter page) |
| `src/components/canvas/` | Viewport only: pan, zoom, grid, minimap. Knows nothing about logic. | Built |
| `src/components/editor/` | Palette, toolbar, inspector, node layer, wire layer, context menus. | Planned |
| `src/components/nodes/` | React views for nodes that need custom rendering (scope, displays). | Planned |
| `src/components/ui/` | shadcn primitives. Generated — see AGENTS.md. | Built |
| `src/hooks/` | Generic React hooks (`use-mobile`, `use-debounced-callback`). | Built |
| `src/lib/circuit/` | Document model, ids, geometry, wire routing, netlist derivation, serialize/migrate. | Partial — schema, ids, io, geometry, wire-path built; coords + netlist planned |
| `src/lib/sim/` | Event queue, engine, four-valued logic, runner, waveform buffer. | Planned |
| `src/lib/nodes/` | Node definitions + registry, one file per node type. | Partial — the `NodeDefinition` shape the renderer needs is in `define.ts`; `defineNode`, `evaluate` and the registry are planned |
| `src/state/` | External stores bridging domain → React, plus `storage.ts` and the derived `scene.ts`. | Partial — storage + scene built; document/history/viewport planned |
| `artifacts/` | These design docs. | Built |

## Rendering model

The canvas already establishes the world→screen transform: a single transformed
layer using `--canvas-x`, `--canvas-y`, `--canvas-zoom`
([canvas/index.tsx](../src/components/canvas/index.tsx)). Build on it, do not
introduce a second transform scheme.

- **Nodes** render from the derived scene ([scene.ts](../src/state/scene.ts),
  [ADR 0004](decisions/0004-derived-scene-graph.md)) as absolutely-positioned
  DOM inside the transformed layer, at world coordinates. DOM (not `<canvas>`)
  so nodes can use shadcn controls, text inputs and focus/ARIA for free.
- **Wires** render in one SVG overlay inside the same transformed layer, drawn
  in world coordinates from `ResolvedWire.points`. One SVG for all wires, not
  one per wire.
- **Overlays** that must not scale with zoom (selection handles, the in-progress
  wire, the minimap) render outside the transformed layer in screen space.

Two coordinate spaces exist and must never be mixed implicitly. Name variables
`worldX`/`screenX`, and route every conversion through the helpers in
`src/lib/circuit/coords.ts` rather than re-deriving `(p - offset) / scale`
inline.

## The React ↔ simulation boundary

The engine ticks far faster than React should re-render. Therefore:

- The engine owns mutable typed arrays of net values. It never calls `setState`.
- After each frame's batch of events, the runner bumps a version counter and
  notifies subscribers.
- Components subscribe with `useSyncExternalStore` **per net or per node**, not
  to the whole simulation. A LED subscribes to one net; re-rendering it must not
  re-render the canvas.
- The oscilloscope reads a ring buffer directly in a `useEffect`/rAF draw call
  and paints to its own `<canvas>` — it never turns samples into React state.

## Editing vs. running

The document store (topology, positions, params) and the simulation state
(values, time) are separate. An edit invalidates and rebuilds the compiled
netlist; it must not reset the document. Rebuilds should be incremental where
cheap, but a full rebuild under ~10 ms for a typical circuit is acceptable — do
the simple thing first, measure before optimising.

## Undo / redo

History lives in `src/state/history.ts` and stores *document* snapshots or
inverse patches — never simulation state. Every mutation goes through a small
set of commands (`addNode`, `moveNodes`, `connect`, `deleteSelection`, …) so
that undo has exactly one place to hook into. Do not mutate the document from a
component.

## Performance guardrails

- No per-frame allocation in the engine hot path; reuse typed arrays.
- Wire hit-testing uses a spatial index, not an O(n) scan per pointer move.
- Nodes offscreen may skip rendering, but must still simulate.
- Profile before optimising, and note the measurement in the PR description.

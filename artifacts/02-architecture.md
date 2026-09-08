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
| `src/app/` | Next.js App Router entry. The editor is one route; keep page files thin. | Built |
| `src/components/canvas/` | Viewport only: pan, zoom, grid, minimap. Knows nothing about logic. | Built |
| `src/components/editor/` | Palette, toolbar, inspector, node layer, wire layer, gestures, command menu, diagnostics. | Built |
| `src/components/nodes/` | React views for nodes that need custom rendering (scope, displays), and the palette icon set. | Built — `node-icons.tsx` plus `node-views.tsx` and the switch/button/lamp/readout views; the instrument views arrive in phase 4 |
| `src/components/ui/` | shadcn primitives. Generated — see AGENTS.md. | Built |
| `src/example/` | The circuits shipped with the app: one `.logits.json` per example plus an `index.ts` that validates them through `fromJson`. Pure data — no React, no storage. | Built — see [ADR 0008](decisions/0008-examples-are-ephemeral.md) |
| `src/hooks/` | Generic React hooks (`use-mobile`, `use-debounced-callback`). | Built |
| `src/lib/circuit/` | Document model, ids, geometry, wire routing, netlist derivation, serialize/migrate. | Built |
| `src/lib/sim/` | Event queue, engine, four-valued logic, runner, waveform buffer. | Partial — `logic.ts`, `queue.ts`, `engine.ts` and `runner.ts` built; the waveform ring buffer arrives with the instruments in phase 4 |
| `src/lib/nodes/` | Node definitions + registry, one file per node type. | Built — `defineNode`, the registry, `paramsSchema`, `view`, and the `gate.*` / `io.*` definitions; the rest of the catalog is phase 4 |
| `src/state/` | External stores bridging domain → React, plus `storage.ts`, the derived `scene.ts` and `hit-test.ts`. | Built — storage, scene, hit-test, `editor-settings.ts`, `document.ts`, `history.ts`, `selection.ts` and `simulation.ts`. The viewport stayed in the canvas component and is published to the editor as a prop; see below |
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

The transform itself stays where it already was, in
[use-canvas-mouse-actions.ts](../src/components/canvas/use-canvas-mouse-actions.ts),
rather than moving into a store. The editor needs the same numbers to convert
pointer positions, so `Canvas` publishes them through `onViewportChange` as a
[`CanvasViewport`](../src/components/canvas/canvas-viewport.ts) — a prop and not
a context, because the consumer is what supplies the canvas's children and so
sits above any provider the canvas could render.

**Picking is arithmetic, not hit-testing by the DOM.** Nodes and wires take no
pointer events; `use-editor-gestures.ts` converts the pointer to world
coordinates once and asks [hit-test.ts](../src/state/hit-test.ts) what is
there. That is what keeps a hit target the same physical size at every zoom —
a DOM target would shrink with the transform — and it is why every tolerance in
that module is a world length converted from screen pixels. The exceptions that
*do* take pointer events are the parts of a node view that genuinely accept
input, and they stop the event so a click toggles rather than starting a drag.

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

[simulation.ts](../src/state/simulation.ts) owns that boundary. Every document
change is pushed in through `syncDocument`, which recompiles the netlist and
compares a *topology signature* — node ids and types, the pins they present,
what those pins are wired to, and each node's `delayNs`. Positions and a
switch's `value` are deliberately not in it:

- **Signature unchanged, params changed** → `engine.setNodeParams`. This is how
  a switch gets flipped mid-run. A rebuild here would reset every net and
  forget every latched value, so the circuit would lose its state each time the
  user touched an input.
- **Signature changed** → a new `Engine` and `Runner`. An edit made while
  running keeps running.
- **Nothing changed but positions** → the netlist is rebuilt and discarded.
  This is the path a drag takes, once per frame.

While paused, both paths then advance the engine on a short leash
(`SETTLE_NS`), event by event until the queue drains. Without it a paused
circuit would read `X` everywhere: nothing downstream of a source has run at
`t = 0`, and an editor where wiring a gate visibly does nothing until you press
play is not much of an editor.

## Undo / redo

History lives in [history.ts](../src/state/history.ts) and stores *document*
snapshots — never simulation state. Snapshots rather than inverse patches
because the commands already share the untouched parts of the document by
reference, so a step costs one object; revisit that only with a measurement.
Consecutive edits that share a label can coalesce, which is what makes a drag
undo in one step instead of one per pointer event.

The commands themselves are pure functions in
[commands.ts](../src/lib/circuit/commands.ts) (`addNode`, `moveNodes`,
`connect`, `deleteElements`, …); [document.ts](../src/state/document.ts) owns
the open document and is the only caller. Do not mutate the document from a
component.

## Performance guardrails

- No per-frame allocation in the engine hot path; reuse typed arrays.
- Wire hit-testing uses a spatial index, not an O(n) scan per pointer move.
- Nodes offscreen may skip rendering, but must still simulate.
- Profile before optimising, and note the measurement in the PR description.

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
| `src/app/` | Next.js App Router entry. The editor is one route; `/preview` (a `CircuitPreview` of a circuit carried in the link) and `/preview/example/[exampleId]` (one of the bundled examples, prerendered) are the others. Keep page files thin. | Built |
| `src/components/canvas/` | Viewport only: pan, zoom, grid, minimap. Knows nothing about logic. | Built |
| `src/components/editor/` | Palette, toolbar, inspector (a popover on the canvas, anchored to the selection), node layer, wire layer, gestures, command menu, diagnostics, performance monitor, the palette's per-element info dialog. | Built |
| `src/components/preview/` | `CircuitPreview`: a circuit that runs and can be operated but not edited, for embedding. Reuses the canvas, both layers, the simulation controls, diagnostics and the performance monitor; owns its own simulation and its own copy of the circuit. Every chrome element and gesture is a prop. | Built |
| `src/components/nodes/` | React views for nodes that need custom rendering (scope, displays), and the palette icon set. | Built — `node-icons.tsx` plus `node-views.tsx` and the switch/button/lamp/readout views; the instrument views arrive in phase 4 |
| `src/components/ui/` | shadcn primitives. Generated — see AGENTS.md. | Built |
| `src/example/` | The circuits shipped with the app: one `.logits.json` per example plus an `index.ts` that validates them through `fromJson`. Pure data — no React, no storage. | Built — see [ADR 0008](decisions/0008-examples-are-ephemeral.md) |
| `src/hooks/` | Generic React hooks (`use-mobile`, `use-debounced-callback`). | Built |
| `src/lib/circuit/` | Document model, ids, geometry, wire routing, netlist derivation, serialize/migrate. Editor commands are `commands.ts`; the chip library's own commands are `subcircuit-commands.ts`, kept separate because nothing in them is reachable from `buildNetlist`. | Built |
| `src/lib/perf/` | Allocation-free measurement primitives (`RollingWindow`: mean, nearest-rank percentile, history). Pure — no clock of its own; callers push samples. | Built |
| `src/lib/sim/` | Event queue, engine, four-valued logic, runner, waveform buffer. | Partial — `logic.ts`, `queue.ts`, `engine.ts` and `runner.ts` built; the waveform ring buffer arrives with the instruments in phase 4 |
| `src/lib/nodes/` | Node definitions + registry, one file per node type. | Built — `defineNode`, the registry, `paramsSchema`, `view`, and the `gate.*` / `io.*` definitions; the rest of the catalog is phase 4 |
| `src/state/` | External stores bridging domain → React, plus `storage.ts`, the derived `scene.ts` and `hit-test.ts`. | Built — storage, scene, hit-test, `editor-settings.ts`, `document.ts`, `history.ts`, `selection.ts`, `in-place-edit.ts` (the node being edited on the canvas) and `simulation.ts`. The viewport stayed in the canvas component and is published to the editor as a prop; see below |
| `artifacts/` | These design docs. | Built |

## Rendering model

The canvas already establishes the world→screen transform: a single transformed
layer carrying its own `transform` style
([canvas/index.tsx](../src/components/canvas/index.tsx)). Build on it, do not
introduce a second transform scheme, and do not move it back into an inherited
CSS variable — that relayouts the whole subtree on every frame of a pan
([ADR 0013](decisions/0013-the-transform-is-a-style-not-a-variable.md)). The
live transform is published through `onViewportChange`.

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

Because the DOM is not consulted, two things it would have given for free are
done by hand. **Occlusion:** picking follows paint order — wires and their
handles are painted beneath every node, so none is pickable inside a node body,
and a pin under a node painted above its own is skipped. The one layer beneath
the wires is the *enclosures* (a `deco.group`): `paintOrder` in
[scene.ts](../src/state/scene.ts) puts them first, the editor renders them as a
separate `NodeLayer` pass before the wire layer, and `nodeAt` picks one only by
its header and edge, so the circuit it frames is picked as if it were not
there. **Chrome:** the
canvas's screen-space `overlay` (the run controls, the diagnostics panel) is a
sibling of the viewport, not a child, so a press on it never bubbles into the
scene hit-test. A content gesture captures the pointer instead, so a drag keeps
tracking while it crosses that chrome.

## The React ↔ simulation boundary

The engine ticks far faster than React should re-render. Therefore:

- The engine owns mutable typed arrays of net values. It never calls `setState`.
- After each frame's batch of events, the runner bumps a version counter and
  notifies subscribers.
- Components subscribe with `useSyncExternalStore` **per net or per node**, not
  to the whole simulation. A LED subscribes to one net; re-rendering it must not
  re-render the canvas.
- **One simulation per surface.** [simulation.ts](../src/state/simulation.ts)
  is a factory, `createSimulation`. The editor runs the default instance through
  the module's plain functions (`syncDocument`, `play`, …); a `CircuitPreview`
  creates its own and provides it through `SimulationContext`. Every hook reads
  the nearest provider, so a view drawn inside a preview reads the preview's
  circuit. A component under the canvas must therefore reach the simulation
  through a hook or `useSimulation()`, never the module functions, which are
  always the editor's.
- The oscilloscope reads a ring buffer directly in a `useEffect`/rAF draw call
  and paints to its own `<canvas>` — it never turns samples into React state.

## Performance monitor

[performance.ts](../src/state/performance.ts) samples the editor while the
monitor is mounted, and [performance-monitor.tsx](../src/components/editor/performance-monitor.tsx)
draws it in the bottom-right corner, mirroring the minimap.

- **Its own rAF loop, a snapshot every 500 ms.** Frame times, input latency and
  the simulation counters are read every frame into `RollingWindow`s; React
  hears about it twice a second. A per-frame React consumer would put its own
  render cost into the frame times it reports.
- **The runner counts, the store divides.** `Runner.stats` are lifetime totals
  (frames, events, simulated ns, engine ms, budget-limited frames), and
  `readSimulationCounters` adds the totals of runners already rebuilt away, so
  sampling twice and dividing by the interval never goes negative after an edit.
- **One store per simulation.** `usePerformanceSnapshot` samples whichever
  simulation `SimulationContext` provides, so a preview's monitor counts its own
  circuit's events. Frame times and latency are the page's and read the same in
  every store.
- **The runner never reads the wall clock.** Engine time per frame is measured
  through an injected `clock`, which `simulation.ts` supplies as
  `performance.now`. It feeds the stats only; without one, costs read 0 and the
  run is identical (`runner.test.ts` checks both).
- **What the numbers mean.** FPS is `requestAnimationFrame` cadence. TPS is
  engine events per second while running. Latency is an input event's
  timestamp to the start of the next frame's callbacks. Long tasks and JS heap
  are shown only where the browser reports them (Chromium).

## Editing vs. running

The document store (topology, positions, params) and the simulation state
(values, time) are separate. An edit invalidates and rebuilds the compiled
netlist; it must not reset the document. Rebuilds should be incremental where
cheap, but a full rebuild under ~10 ms for a typical circuit is acceptable — do
the simple thing first, measure before optimising.

`document.ts` also owns *which* document is open. A project's chips are
documents too, and editing one is a path into the project rather than a second
editor: `getDocument()` returns the open chip, `getRootDocument()` the project,
and `apply` writes an edit back into the project's library — so every command,
the scene, the netlist and the simulation work inside a chip unchanged, and
history, autosave and the project id stay the project's. Anything that means
"the project" — export, duplicate, share, delete, `defaultZoom` — must say so
with `getRootDocument`. See
[ADR 0012](decisions/0012-editing-a-chip-is-a-path-into-the-project.md).

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

## Preview

[circuit-preview.tsx](../src/components/preview/circuit-preview.tsx) is the
editor with editing taken out: the same canvas, node layer and wire layer, with
no gesture hook, no selection, no inspector and no document store.

- **Its own circuit.** The document it is given is copied into component state.
  Operating a node view — a switch, a keypad — applies the same pure command the
  document store uses (`setLinkedNodeParams`) to that copy, with no history and
  no autosave: nothing a viewer does to a preview is an edit worth keeping.
  `onDocumentChange` hands the result to the caller, who can keep it if they do.
- **Params writes are the caller's.** `NodeLayer` takes `onSetNodeParams`; the
  editor passes `updateNodeParams`, the preview its own setter. `CircuitNode`
  no longer imports the document store.
- **Framed once.** With `fitView` it fits the scene's clusters into the size it
  was mounted at (`fitViewport` in [coords.ts](../src/lib/circuit/coords.ts)),
  never zooming past the document's `defaultZoom`, and passes that framing to
  the canvas as `defaultZoom` / `defaultOffset` so "reset view" returns to it. A
  later resize does not re-fit.
- **Keys scoped to itself.** Its shortcuts are bound on the preview element,
  not `window`, and the editor's window shortcuts ignore events from inside a
  `[data-circuit-preview]`.

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

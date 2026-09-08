# Roadmap

Phases are ordered by dependency, not by deadline. Finish a phase's exit
criteria before starting the next; if you must go out of order, say so in the PR.
Update the status boxes here as part of the work — a merged phase with stale
boxes is an incomplete phase.

## Phase 0 — Foundations (done)

- [x] Next.js + Tailwind v4 + shadcn set up
- [x] Infinite canvas: pan, zoom, grid, minimap
- [x] `useDebouncedCallback`
- [x] Replace the create-next-app starter [page.tsx](../src/app/page.tsx) with the editor shell — it now owns the active project and wires the sidebar to storage; the editor surface itself is Phase 3
- [x] Set app metadata in [layout.tsx](../src/app/layout.tsx)
- [x] Define `--logit-cursor-*` custom properties in [globals.css](../src/app/globals.css)
- [x] Add a test runner (Vitest) and wire `bun run test` — node environment, `src/**/*.test.ts`, with the existing domain modules covered
- **Exit:** `bun run test` and `bun run build` pass, `bun run lint` is clean outside the generated `src/components/ui/`, and the app boots to the editor shell rather than the starter page.

## Phase 1 — Model and netlist (done)

- [x] `src/lib/circuit/`: types, ids, coords, `buildNetlist`, diagnostics — [netlist.ts](../src/lib/circuit/netlist.ts) compiles sorted-key union-find nets with `width-mismatch`, `multiple-drivers`, `undriven-input`, `unknown-node-type` and `unknown-pin` diagnostics
- [x] `src/state/document.ts` with command-based mutations + undo/redo — snapshot history in [history.ts](../src/state/history.ts), with drag coalescing so a gesture undoes in one step
- [x] Serialize / deserialize / migrate, `localStorage` autosave — debounced in the store rather than a component, so an edit still reaches storage if the editor unmounts
- **Exit:** a hand-written JSON circuit loads and compiles to a netlist, with tests for union-find grouping, width mismatch, and multi-driver detection. **Met** — [netlist.test.ts](../src/lib/circuit/netlist.test.ts).

## Phase 2 — Engine (done)

- [x] Four-valued logic + resolution table — [logic.ts](../src/lib/sim/logic.ts), with the two-input operations as lookup tables that bake in their controlling values
- [x] Event queue, engine, reset, oscillation budget — [queue.ts](../src/lib/sim/queue.ts) orders by `(time, sequence)` and coalesces duplicate evals; [engine.ts](../src/lib/sim/engine.ts) separates a yield from a true oscillation per [ADR 0005](decisions/0005-oscillation-is-zero-delay-churn.md)
- [x] Runner with play / pause / step / speed — [runner.ts](../src/lib/sim/runner.ts), one notification per frame, taking an injected `FrameScheduler` so it runs in a Node test
- [x] Node registry, `defineNode`, the seven basic gates — `evaluate` and `delayNs` are on `NodeDefinition`, and every `gate.*` and `io.*` source simulates
- **Exit:** a headless test simulates a ring oscillator and an SR latch with the expected waveforms, and an oscillating circuit terminates with a diagnostic instead of hanging. **Met** — [engine.test.ts](../src/lib/sim/engine.test.ts).

## Phase 3 — Editor (done)

- [x] Node layer, wire layer, pin hit-testing, selection — [node-layer.tsx](../src/components/editor/node-layer.tsx) and [circuit-node.tsx](../src/components/editor/circuit-node.tsx) draw DOM nodes at world coordinates, [wire-layer.tsx](../src/components/editor/wire-layer.tsx) draws every wire in one SVG, and picking is arithmetic against the scene in [hit-test.ts](../src/state/hit-test.ts) rather than DOM hit-testing, so a target stays the same size in screen pixels at every zoom
- [x] Wiring gestures, rubber-band select, delete, duplicate, copy/paste — [use-editor-gestures.ts](../src/components/editor/use-editor-gestures.ts) and [use-editor-shortcuts.ts](../src/components/editor/use-editor-shortcuts.ts); the clipboard holds a document `Fragment`, not ids, so cut-then-paste works and a paste can cross documents
- [x] Palette + command menu, inspector driven by `paramsSchema` — [command-menu.tsx](../src/components/editor/command-menu.tsx) and [inspector.tsx](../src/components/editor/inspector.tsx), both generated from the registry and from each definition's `paramsSchema`, so neither names a node type
- [x] Toolbar: run controls, zoom, save/load, diagnostics panel — [run-controls.tsx](../src/components/editor/run-controls.tsx) and [diagnostics-panel.tsx](../src/components/editor/diagnostics-panel.tsx); zoom stays on the minimap where it already was
- [x] Per-project default zoom — [project-settings-panel.tsx](../src/components/editor/project-settings-panel.tsx) edits `defaultZoom` through a document command, so it is saved, exported and undoable; the canvas takes it as `defaultZoom`/`viewKey` and frames each circuit on open. Save format is now **v2** ([io.ts](../src/lib/circuit/io.ts))
- [x] The simulation store: [simulation.ts](../src/state/simulation.ts) owns an `Engine` and `Runner` per document and decides, per edit, between a rebuild and a live `setNodeParams` — which is what lets a switch be flipped mid-run without wiping the circuit's state
- **Exit:** a user builds a 4-bit adder from scratch with the mouse and sees it work. **Met** — place from the palette or `⌘K`, drag pin to pin to wire, flip the switches, and the sums light the LEDs.

## Phase 4 — The rest of the nodes

- [ ] Sources/sinks, timing, sequential, combinational blocks ([06-node-catalog.md](06-node-catalog.md))
- [ ] Instruments: oscilloscope, 7-segment, hex display, bargraph
- [ ] Buses: split/merge/tunnel
- [ ] Subcircuits (user-defined chips) with port nodes and instancing
- **Exit:** every node in the catalog exists, each with a test.

## Phase 5 — Polish

- [ ] Example circuits shipped with the app
- [ ] Shareable URL encoding — file import/export landed with the phase 3 toolbar
- [ ] Performance pass against the 2,000-node target
- [ ] Keyboard-only walkthrough and a11y audit

## Known issues

| Issue | Where |
| --- | --- |
| Projects sidebar has no routing — the open project lives in React state, so it is lost on reload and has no URL | [app/page.tsx](../src/app/page.tsx) |
| Canvas header menu (New / Rename / Duplicate / Export / Delete) is still disabled. Export and import now exist on the editor toolbar; the menu still needs the confirm dialog lifted out of the projects sidebar before delete can be wired | [canvas/components/header.tsx](../src/components/canvas/components/header.tsx) |
| `bun run lint` reports pre-existing errors, all in generated shadcn primitives (mostly `a11y/useSemanticElements`); they need a biome override or a regeneration, not hand edits | [components/ui/](../src/components/ui/) |
| `renameProject` in the projects store rewrites the stored document from disk, which would discard unsaved edits if the document is open. Use `renameOpenDocument` for the open one; the two paths need merging when routing lands | [state/projects-store.ts](../src/state/projects-store.ts) |
| `SidebarProvider` is hand-edited (a generated shadcn file) to take `cookieName` and `keyboardShortcut`, so the page's two sidebars do not share one cookie or both toggle on `⌘B`. A regeneration will drop it | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |
| `emitSample` is declared on `EvalContext` but no node emits and nothing collects; the waveform ring buffer lands with the oscilloscope in Phase 4 | [lib/nodes/define.ts](../src/lib/nodes/define.ts) |
| Subcircuits are not flattened — `buildNetlist` compiles the top-level document only, which is correct until phase 4 introduces instancing | [lib/circuit/netlist.ts](../src/lib/circuit/netlist.ts) |
| A stored `light` theme is applied on hydration, so the first paint is always dark — the alternative is a blocking script in the document head | [state/editor-settings.ts](../src/state/editor-settings.ts) |
| `SidebarMenuSkeleton` picks a random width and cannot be server-rendered without a hydration mismatch; the sidebar hand-rolls its placeholders instead | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |
| Wire picking and rubber-band selection scan every wire per pointer event. Fine at the catalogue's scale, but the architecture calls for a spatial index; that is the phase 5 performance pass, with a measurement | [state/hit-test.ts](../src/state/hit-test.ts) |
| Every node renders, on or off screen. Culling against the visible world rect is cheap to add and belongs with the same performance pass | [editor/node-layer.tsx](../src/components/editor/node-layer.tsx) |
| The inspector edits one node at a time; a multi-node selection gets rotate and delete only. A merged parameter view needs a "mixed value" story first | [editor/inspector.tsx](../src/components/editor/inspector.tsx) |
| `Ctrl+A` is deliberately unbound — select-all lands in phase 5 with the rest of the keyboard walkthrough | [editor/use-editor-shortcuts.ts](../src/components/editor/use-editor-shortcuts.ts) |
| A paused edit advances simulated time by up to `SETTLE_NS` so the canvas shows settled values. It is honest but visible: the clock reads a few nanoseconds after placing a gate | [state/simulation.ts](../src/state/simulation.ts) |
| Default zoom is typed as a percentage; there is no "use the current zoom" button, because the live scale lives in the canvas and the panel is a sibling of the editor. It needs the viewport lifted to the page shell, or a project store to publish it | [editor/project-settings-panel.tsx](../src/components/editor/project-settings-panel.tsx) |
| Touch has pan and zoom but no editing gestures — a drag on a node pans the canvas. The pointer handlers are written against mouse semantics and need a tap/long-press story | [canvas/index.tsx](../src/components/canvas/index.tsx) |

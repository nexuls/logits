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

## Phase 3 — Editor

- [ ] Node layer, wire layer, pin hit-testing, selection — the derived scene ([scene.ts](../src/state/scene.ts)) they render from is built
- [ ] Wiring gestures, rubber-band select, delete, duplicate, copy/paste — wire routing and segment-bend maths ([wire-path.ts](../src/lib/circuit/wire-path.ts)) are built; the pointer handling that calls them is not
- [ ] Palette + command menu, inspector driven by `paramsSchema` — the palette ([elements-sidebar.tsx](../src/components/editor/elements-sidebar.tsx)) is built and arms a node type; the command menu and inspector are outstanding
- [ ] Toolbar: run controls, zoom, save/load, diagnostics panel — the `Runner` behind the run controls is built and exposes a `useSyncExternalStore` pair; nothing subscribes to it yet
- **Exit:** a user builds a 4-bit adder from scratch with the mouse and sees it work.

## Phase 4 — The rest of the nodes

- [ ] Sources/sinks, timing, sequential, combinational blocks ([06-node-catalog.md](06-node-catalog.md))
- [ ] Instruments: oscilloscope, 7-segment, hex display, bargraph
- [ ] Buses: split/merge/tunnel
- [ ] Subcircuits (user-defined chips) with port nodes and instancing
- **Exit:** every node in the catalog exists, each with a test.

## Phase 5 — Polish

- [ ] Example circuits shipped with the app
- [ ] Import/export files, shareable URL encoding
- [ ] Performance pass against the 2,000-node target
- [ ] Keyboard-only walkthrough and a11y audit

## Known issues

| Issue | Where |
| --- | --- |
| `Canvas` takes a `content: string` placeholder prop and renders it as a box; replace with the node layer | [canvas/index.tsx](../src/components/canvas/index.tsx) |
| `onContentChange` prop is declared but unused | same |
| `CanvasViewer` hardcodes a 360×120 content footprint | [canvas-viewer.tsx](../src/components/canvas/canvas-viewer.tsx) |
| `T_Node` in `canvas-type.ts` is a leftover placeholder, unrelated to the real node model | [canvas-type.ts](../src/components/canvas/canvas-type.ts) |
| Projects sidebar has no routing — the open project lives in React state, so it is lost on reload and has no URL | [app/page.tsx](../src/app/page.tsx) |
| Canvas header menu (New / Rename / Duplicate / Export / Delete) is still disabled; the store actions exist but delete needs the confirm dialog lifted out of the sidebar, and export needs a download flow | [canvas/components/header.tsx](../src/components/canvas/components/header.tsx) |
| `bun run lint` reports 24 pre-existing errors, all in generated shadcn primitives (mostly `a11y/useSemanticElements`); they need a biome override or a regeneration, not hand edits | [components/ui/](../src/components/ui/) |
| The document store is not wired to the editor yet: `page.tsx` still renders from the project index, so nothing opens a document, nothing renders nodes, and the palette's armed type stays inert. Needs the node layer (Phase 3) | [app/page.tsx](../src/app/page.tsx), [state/document.ts](../src/state/document.ts) |
| `renameProject` in the projects store rewrites the stored document from disk, which would discard unsaved edits if the document is open. Use `renameOpenDocument` for the open one; the two paths need merging when routing lands | [state/projects-store.ts](../src/state/projects-store.ts) |
| `SidebarProvider` is hand-edited (a generated shadcn file) to take `cookieName` and `keyboardShortcut`, so the page's two sidebars do not share one cookie or both toggle on `⌘B`. A regeneration will drop it | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |
| `ResolvedPin.netId` is still always `null`. The engine exists now, but nothing owns an `Engine` per document — that store is Phase 3, and it is what will fill this in | [state/scene.ts](../src/state/scene.ts), [lib/sim/engine.ts](../src/lib/sim/engine.ts) |
| Nothing constructs an `Engine` or a `Runner` yet: the editor has no simulation store, so no net values reach the canvas and the run controls have nothing to drive | [state/](../src/state/), [lib/sim/runner.ts](../src/lib/sim/runner.ts) |
| A flipped switch needs `engine.setNodeParams` *and* the document command, or the engine and the document disagree. The Phase 3 store has to own both halves of that | [lib/sim/engine.ts](../src/lib/sim/engine.ts), [lib/circuit/commands.ts](../src/lib/circuit/commands.ts) |
| `emitSample` is declared on `EvalContext` but no node emits and nothing collects; the waveform ring buffer lands with the oscilloscope in Phase 4 | [lib/nodes/define.ts](../src/lib/nodes/define.ts) |
| Subcircuits are not flattened — `buildNetlist` compiles the top-level document only, which is correct until phase 4 introduces instancing | [lib/circuit/netlist.ts](../src/lib/circuit/netlist.ts) |
| A stored `light` theme is applied on hydration, so the first paint is always dark — the alternative is a blocking script in the document head | [state/editor-settings.ts](../src/state/editor-settings.ts) |
| `SidebarMenuSkeleton` picks a random width and cannot be server-rendered without a hydration mismatch; the sidebar hand-rolls its placeholders instead | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |

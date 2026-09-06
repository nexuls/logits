# Roadmap

Phases are ordered by dependency, not by deadline. Finish a phase's exit
criteria before starting the next; if you must go out of order, say so in the PR.
Update the status boxes here as part of the work — a merged phase with stale
boxes is an incomplete phase.

## Phase 0 — Foundations (in progress)

- [x] Next.js + Tailwind v4 + shadcn set up
- [x] Infinite canvas: pan, zoom, grid, minimap
- [x] `useDebouncedCallback`
- [ ] Replace the create-next-app starter [page.tsx](../src/app/page.tsx) with the editor shell
- [ ] Set app metadata in [layout.tsx](../src/app/layout.tsx) (still "Create Next App")
- [ ] Define `--logit-cursor-*` custom properties in [globals.css](../src/app/globals.css) — the canvas already consumes them and they do not exist
- [ ] Add a test runner (Vitest) and wire `bun run test`; the domain layer is untestable until this lands

## Phase 1 — Model and netlist

- [ ] `src/lib/circuit/`: types, ids, coords, `buildNetlist`, diagnostics — zod schemas, ids and geometry done; `coords.ts` (world↔screen) and netlist outstanding
- [ ] `src/state/document.ts` with command-based mutations + undo/redo
- [ ] Serialize / deserialize / migrate, `localStorage` autosave — `io.ts` and `src/state/storage.ts` done; the debounced autosave hook-up is outstanding
- **Exit:** a hand-written JSON circuit loads and compiles to a netlist, with tests for union-find grouping, width mismatch, and multi-driver detection.

## Phase 2 — Engine

- [ ] Four-valued logic + resolution table
- [ ] Event queue, engine, reset, oscillation budget
- [ ] Runner with play / pause / step / speed
- [ ] Node registry, `defineNode`, the seven basic gates
- **Exit:** a headless test simulates a ring oscillator and an SR latch with the expected waveforms, and an oscillating circuit terminates with a diagnostic instead of hanging.

## Phase 3 — Editor

- [ ] Node layer, wire layer, pin hit-testing, selection — the derived scene ([scene.ts](../src/state/scene.ts)) they render from is built
- [ ] Wiring gestures, rubber-band select, delete, duplicate, copy/paste — wire routing and segment-bend maths ([wire-path.ts](../src/lib/circuit/wire-path.ts)) are built; the pointer handling that calls them is not
- [ ] Palette + command menu, inspector driven by `paramsSchema`
- [ ] Toolbar: run controls, zoom, save/load, diagnostics panel
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
| `--logit-cursor-*` referenced but undefined | [canvas/index.tsx](../src/components/canvas/index.tsx) → globals.css |
| `Canvas` takes a `content: string` placeholder prop and renders it as a box; replace with the node layer | [canvas/index.tsx](../src/components/canvas/index.tsx) |
| `onContentChange` prop is declared but unused | same |
| `CanvasViewer` hardcodes a 360×120 content footprint | [canvas-viewer.tsx](../src/components/canvas/canvas-viewer.tsx) |
| `T_Node` in `canvas-type.ts` is a leftover placeholder, unrelated to the real node model | [canvas-type.ts](../src/components/canvas/canvas-type.ts) |
| No test runner configured | `package.json` |
| Projects sidebar lists sample data and has no persistence, rename/delete or routing | [projects/projects.ts](../src/components/projects/projects.ts) |
| `Project` duplicates `ProjectMeta` and stores a pre-formatted `updatedLabel`; switch it to `readProjects()` and format `updatedAt` client-side | [projects/projects.ts](../src/components/projects/projects.ts) → [state/storage.ts](../src/state/storage.ts) |

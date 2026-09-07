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

## Phase 1 — Model and netlist

- [ ] `src/lib/circuit/`: types, ids, coords, `buildNetlist`, diagnostics — zod schemas, ids and geometry done; `coords.ts` (world↔screen) and netlist outstanding
- [ ] `src/state/document.ts` with command-based mutations + undo/redo
- [ ] Serialize / deserialize / migrate, `localStorage` autosave — `io.ts` and `src/state/storage.ts` done; the debounced autosave hook-up is outstanding
- **Exit:** a hand-written JSON circuit loads and compiles to a netlist, with tests for union-find grouping, width mismatch, and multi-driver detection.

## Phase 2 — Engine

- [ ] Four-valued logic + resolution table
- [ ] Event queue, engine, reset, oscillation budget
- [ ] Runner with play / pause / step / speed
- [ ] Node registry, `defineNode`, the seven basic gates — `defineNode`, `registry.ts` and the `gate.*` / `io.*` definitions exist, but pin layout and footprint only; `evaluate` and `delayNs` are outstanding
- **Exit:** a headless test simulates a ring oscillator and an SR latch with the expected waveforms, and an oscillating circuit terminates with a diagnostic instead of hanging.

## Phase 3 — Editor

- [ ] Node layer, wire layer, pin hit-testing, selection — the derived scene ([scene.ts](../src/state/scene.ts)) they render from is built
- [ ] Wiring gestures, rubber-band select, delete, duplicate, copy/paste — wire routing and segment-bend maths ([wire-path.ts](../src/lib/circuit/wire-path.ts)) are built; the pointer handling that calls them is not
- [ ] Palette + command menu, inspector driven by `paramsSchema` — the palette ([elements-sidebar.tsx](../src/components/editor/elements-sidebar.tsx)) is built and arms a node type; the command menu and inspector are outstanding
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
| `Canvas` takes a `content: string` placeholder prop and renders it as a box; replace with the node layer | [canvas/index.tsx](../src/components/canvas/index.tsx) |
| `onContentChange` prop is declared but unused | same |
| `CanvasViewer` hardcodes a 360×120 content footprint | [canvas-viewer.tsx](../src/components/canvas/canvas-viewer.tsx) |
| `T_Node` in `canvas-type.ts` is a leftover placeholder, unrelated to the real node model | [canvas-type.ts](../src/components/canvas/canvas-type.ts) |
| Projects sidebar has no routing — the open project lives in React state, so it is lost on reload and has no URL | [app/page.tsx](../src/app/page.tsx) |
| Canvas header menu (New / Rename / Duplicate / Export / Delete) is still disabled; the store actions exist but delete needs the confirm dialog lifted out of the sidebar, and export needs a download flow | [canvas/components/header.tsx](../src/components/canvas/components/header.tsx) |
| `bun run lint` reports 24 pre-existing errors, all in generated shadcn primitives (mostly `a11y/useSemanticElements`); they need a biome override or a regeneration, not hand edits | [components/ui/](../src/components/ui/) |
| The palette arms a node type but nothing consumes it — placement needs the document commands and canvas drop handling from Phase 1/3 | [app/page.tsx](../src/app/page.tsx), [editor/elements-sidebar.tsx](../src/components/editor/elements-sidebar.tsx) |
| `SidebarProvider` is hand-edited (a generated shadcn file) to take `cookieName` and `keyboardShortcut`, so the page's two sidebars do not share one cookie or both toggle on `⌘B`. A regeneration will drop it | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |
| A stored `light` theme is applied on hydration, so the first paint is always dark — the alternative is a blocking script in the document head | [state/editor-settings.ts](../src/state/editor-settings.ts) |
| `SidebarMenuSkeleton` picks a random width and cannot be server-rendered without a hydration mismatch; the sidebar hand-rolls its placeholders instead | [ui/sidebar.tsx](../src/components/ui/sidebar.tsx) |

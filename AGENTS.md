<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Logits

An interactive canvas for designing and simulating digital logic. Users place
nodes (gates, clocks, flip-flops, oscilloscopes, 7-segment displays), wire pins
together, and watch signals propagate in real time. Every element on the canvas
is a reusable node definition.

## Read before you write code

Design docs live in [`artifacts/`](artifacts/). They are the source of truth for
intent; `src/` is the source of truth for what exists. Start at
[artifacts/README.md](artifacts/README.md) and read the doc for the area you are
touching:

| Touching | Read |
| --- | --- |
| Anything | [01-product-spec.md](artifacts/01-product-spec.md) (scope + what we say no to) |
| Module layout, layer boundaries | [02-architecture.md](artifacts/02-architecture.md) |
| Document, netlist, save format | [03-data-model.md](artifacts/03-data-model.md) |
| `src/lib/sim/`, any `evaluate` | [04-simulation-engine.md](artifacts/04-simulation-engine.md) |
| **Adding a node** | [05-node-authoring-guide.md](artifacts/05-node-authoring-guide.md) + [06-node-catalog.md](artifacts/06-node-catalog.md) |
| Input, gestures, shortcuts | [07-interaction-spec.md](artifacts/07-interaction-spec.md) |
| Picking up work | [08-roadmap.md](artifacts/08-roadmap.md) |
| "Why is it like this?" | [artifacts/decisions/](artifacts/decisions/) |

If your change contradicts a doc, update the doc in the same commit. If it
reverses a decision, add an ADR. Do not leave the two disagreeing.

## Non-negotiables

1. **The domain layer is pure.** Nothing in `src/lib/` may import React,
   `next/*`, or touch the DOM or `window`. It must run in a plain Node test.
2. **The engine is deterministic.** No `Math.random`, no `Date.now()`, no
   iteration-order dependence inside `src/lib/sim/`. Same circuit in, same
   waveform out, every time.
3. **Adding a node touches two files**: its definition under `src/lib/nodes/`,
   and `src/lib/nodes/registry.ts`. If you need to edit the canvas, engine,
   palette or inspector to make a node work, the abstraction is broken — fix
   that instead of special-casing the node.
4. **Never special-case a node `type` outside its own definition file.**
5. **Signals are four-valued** (`0`/`1`/`X`/`Z`), never booleans or number
   bitmasks. See [ADR 0002](artifacts/decisions/0002-four-valued-logic.md).
6. **One pan/zoom implementation**, the one in `src/components/canvas/`. Build on
   its `--canvas-x` / `--canvas-y` / `--canvas-zoom` transform; do not add a second.
7. **World and screen coordinates never mix implicitly.** Name variables
   `worldX` / `screenX` and convert through the shared helpers.
8. **The simulation never drives React state per event.** One notification per
   frame; components subscribe per net via `useSyncExternalStore`.
9. **Document mutations go through commands** so undo and autosave have one hook.
   Components do not mutate the document directly.
10. **Pin ids and node `type` strings are part of the save format.** Renaming one
    is a breaking change that needs a migration in `src/lib/circuit/io.ts`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind v4 ·
shadcn/base-ui · Biome · **Bun**.

Note the banner above: this Next.js version differs from your training data.
Check `node_modules/next/dist/docs/` before using an App Router API, and note
that `layout.tsx` already uses the generated `LayoutProps<"/">` type rather than
a hand-written props type.

## Commands

```bash
bun install
bun run dev       # next dev
bun run build     # next build — run before claiming a change compiles
bun run lint      # biome check
bun run format    # biome format --write
bun run test      # vitest run
bun run test:watch
```

Tests are Vitest, run in the `node` environment, and live beside the code they
cover as `*.test.ts`. That environment is deliberate: anything in `src/lib/`
that needs a DOM to be tested is in the wrong layer.

Use `bun`, never `npm`/`yarn`/`pnpm`.

## Conventions

Follow the code that is already there — `src/components/canvas/` is the
reference for style.

- **Files** kebab-case. **Types** `PascalCase`. Components `PascalCase`, default
  export for a component that owns a file; named exports for hooks and utilities.
- Component props: a local `type Props = { … }` above the component, not an
  exported interface, not inline generics.
- Import with the `@/` alias for anything outside the current folder; relative
  imports within a folder (`./canvas-grid`).
- `"use client"` only where interactivity actually requires it, at the boundary —
  not on every file in a folder.
- `cn()` comes from `@/lib/utils`. Style with Tailwind classes and the semantic
  design tokens (`bg-sidebar`, `text-muted-foreground`, `var(--primary)`), never
  hardcoded hex or raw `zinc-*` in app UI. The app is dark-first (`dark` class is
  on `<html>`) but both themes must work.
- `src/components/ui/` is generated by shadcn. Prefer `bunx shadcn@latest add`
  over hand-editing; if you must edit, say so in the PR.
- Extract a hook when logic exceeds ~30 lines of state wrangling — see
  `use-canvas-mouse-actions.ts`.
- Comment *why*, not *what*. The existing canvas code documents non-obvious math
  (DPR scaling, world↔mini projection); match that bar and no more.
- Guard keyboard shortcuts against text inputs. Reuse the `isEditableTarget`
  pattern in `use-canvas-mouse-actions.ts` rather than writing a second one.

## Accessibility

Nodes are DOM specifically so this is achievable — do not squander it. Interactive
elements are focusable and labelled, every mouse action has a keyboard path, and
signal state is never communicated by colour alone (`X` gets a marker, not just red).

## Working agreements

- Finish the whole task. If part is blocked, complete the rest and say plainly
  what you left out and why.
- Run `bun run lint` and `bun run build` before reporting a change as done, and
  report failures with their output rather than describing them.
- Do not delete or reorder the `nextjs-agent-rules` block at the top of this
  file — `next dev` regenerates it, and removing it just re-dirties the tree.
- Update the checkboxes and Known issues table in
  [08-roadmap.md](artifacts/08-roadmap.md) as part of the work, not afterwards.

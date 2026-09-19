# Contributing to Logits

Logits is a canvas for designing and simulating digital logic. Contributions
are welcome — bug reports, feature requests, new nodes, example circuits, docs
and code.

A note on the licence first, because it is not the usual one. Logits is
[source-available, not open source](LICENSE.md): the PolyForm Noncommercial
License 1.0.0 lets you use, fork and modify it freely for any noncommercial
purpose, but not commercially. By opening a pull request you agree your
contribution is licensed to the project under those same terms.

## Before you write code

Two things will save you a rewrite.

**Check the scope.** [artifacts/01-product-spec.md](artifacts/01-product-spec.md)
says what Logits is and — just as important — what it says no to. Analog and
transistor-level simulation, HDL import/export, real-time collaboration,
accounts and a backend are all deliberately out. A PR that adds one of those
will be declined no matter how good the code is.

**Read the doc for the area you are touching.** Design docs live in
[`artifacts/`](artifacts/) and are the source of truth for *intent*; `src/` is
the source of truth for *what exists*. Start at
[artifacts/README.md](artifacts/README.md), then:

| Touching | Read |
| --- | --- |
| Module layout, layer boundaries | [02-architecture.md](artifacts/02-architecture.md) |
| Document, netlist, save format | [03-data-model.md](artifacts/03-data-model.md) |
| `src/lib/sim/`, any `evaluate` | [04-simulation-engine.md](artifacts/04-simulation-engine.md) |
| Adding a node | [05-node-authoring-guide.md](artifacts/05-node-authoring-guide.md) + [06-node-catalog.md](artifacts/06-node-catalog.md) |
| Input, gestures, shortcuts | [07-interaction-spec.md](artifacts/07-interaction-spec.md) |
| Looking for work to pick up | [08-roadmap.md](artifacts/08-roadmap.md) |
| "Why is it built like this?" | [artifacts/decisions/](artifacts/decisions/) |

The [ADRs](artifacts/decisions/) are short and answer most of the "why on earth
is it done this way" questions — four-valued logic, DOM nodes with SVG wires,
event-driven simulation, free-angle wires.

## Getting set up

Logits uses [Bun](https://bun.sh). Use it rather than npm, yarn or pnpm — the
lockfile is `bun.lock`.

```bash
bun install
bun run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `bun run dev` | Dev server |
| `bun run build` | Production build — run before you claim a change compiles |
| `bun run lint` | Biome check |
| `bun run format` | Biome format, writing in place |
| `bun run test` | Vitest, one pass |
| `bun run test:watch` | Vitest, watching |

There is no CI on this repo yet, so `bun run lint`, `bun run test` and
`bun run build` passing locally is the bar for a PR.

## How the code is laid out

```
src/lib/          the domain layer — pure TypeScript, no React, no DOM
  nodes/          every node definition, grouped by family (gates, mem, io, …)
  sim/            the simulation engine
  circuit/        document, commands, netlist, save format, geometry
src/state/        stores that bridge the domain layer to React
src/components/   UI; canvas/ is the reference for style
src/example/      bundled example circuits as .json
artifacts/        design docs and ADRs
```

## The rules that are not negotiable

These are load-bearing. A PR that breaks one will get a change request even if
it works. The full list lives in [AGENTS.md](AGENTS.md); the short version:

1. **`src/lib/` is pure.** No React, no `next/*`, no DOM, no `window`. It has to
   run in a plain Node test.
2. **The engine is deterministic.** No `Math.random`, no `Date.now()`, no
   dependence on iteration order inside `src/lib/sim/`. Same circuit in, same
   waveform out, every time.
3. **Adding a node touches two files** — its definition under `src/lib/nodes/`
   and `src/lib/nodes/registry.ts`. If you need to edit the canvas, engine,
   palette or inspector to make your node work, the abstraction is broken; fix
   that instead of special-casing the node.
4. **Never special-case a node `type` outside its own definition file.**
5. **Signals are four-valued** (`0`/`1`/`X`/`Z`) — never booleans, never number
   bitmasks. See [ADR 0002](artifacts/decisions/0002-four-valued-logic.md).
6. **One pan/zoom implementation**, the one in `src/components/canvas/`. Build
   on the `transform` it writes on its own layer — a style, never a CSS variable
   ([ADR 0013](artifacts/decisions/0013-the-transform-is-a-style-not-a-variable.md)),
   and read the live value from `onViewportChange`.
7. **World and screen coordinates never mix implicitly.** Name variables
   `worldX` / `screenX` and convert through the shared helpers.
8. **The simulation never drives React state per event.** One notification per
   frame; components subscribe per net with `useSyncExternalStore`.
9. **Document mutations go through commands**, so undo and autosave have one
   hook. Components never mutate the document directly.
10. **Pin ids and node `type` strings are part of the save format.** Renaming
    one is a breaking change and needs a migration in `src/lib/circuit/io.ts`.

## Adding a node

This is the most common contribution and the most fun one. A node is a single
definition object — pins, an `evaluate`, how it draws, its docs — and the
system derives the palette entry, the command menu, the inspector form, the
help page and the netlist from it.

1. Read [05-node-authoring-guide.md](artifacts/05-node-authoring-guide.md), all
   of it. It has a checklist for a new node and a list of anti-patterns.
2. Check [06-node-catalog.md](artifacts/06-node-catalog.md) — the node may
   already exist, or the catalog may already have a considered opinion on it.
3. Write the definition in the right family folder under `src/lib/nodes/`
   (`gates/`, `comb/`, `seq/`, `mem/`, `io/`, `bus/`, `timing/`,
   `instruments/`, `deco/`, `sub/`). Look at a small one like
   [gates/not.ts](src/lib/nodes/gates/not.ts) first.
4. Register it in [registry.ts](src/lib/nodes/registry.ts).
5. Write the `docs` string properly. It is what users read in the help panel,
   and the guide has a section on what makes a good one — behaviour, a truth
   table where one helps, typical uses.
6. Add tests for `evaluate`, including the `X` and `Z` cases. Unresolved inputs
   should stay unresolved rather than be guessed.
7. Add the node to the catalog doc.

## Adding an example circuit

Bundled examples are circuit documents in the `.logits.json` save format,
stored as `.json` under [`src/example/`](src/example/) and imported in
[index.ts](src/example/index.ts). The format, the wiring rules and the layout
conventions are covered in
[.claude/skills/logits-circuit/SKILL.md](.claude/skills/logits-circuit/SKILL.md).
Keep an example small enough to read at a glance and make sure it actually runs
before sending it.

## Tests

Tests are Vitest, run in the `node` environment, and live next to the code they
cover as `*.test.ts`. That environment is a deliberate constraint: anything in
`src/lib/` that needs a DOM to be tested is in the wrong layer.
[`src/test/circuit.ts`](src/test/circuit.ts) has helpers for building a
document in a test.

Anything touching the engine, the netlist, the save format or a node's
`evaluate` needs tests. UI behaviour that can be expressed as a pure state
transition should be tested at the store level in `src/state/`.

## Style

Biome handles formatting — run `bun run format` and don't argue with it. Beyond
that, follow the code that is already there; `src/components/canvas/` is the
reference.

- **Files** kebab-case. **Types** `PascalCase`. Components `PascalCase`, default
  export for a component that owns its file; named exports for hooks and utils.
- Component props: a local `type Props = { … }` above the component — not an
  exported interface, not inline generics.
- Import with the `@/` alias for anything outside the current folder; relative
  (`./canvas-grid`) within a folder.
- `"use client"` only where interactivity actually needs it, at the boundary —
  not on every file in a folder.
- Style with Tailwind and the semantic design tokens (`bg-sidebar`,
  `text-muted-foreground`, `var(--primary)`). Never hardcoded hex, never raw
  `zinc-*` in app UI. The app is dark-first, but both themes must work.
- `cn()` comes from `@/lib/utils`.
- `src/components/ui/` is generated by shadcn. Prefer `bunx shadcn@latest add`
  to hand-editing; if you do hand-edit, say so in the PR. It has a `biome.json`
  override turning off the rules the upstream primitives trip, because a hand
  fix there is lost on the next `add` — app code is still held to all of them,
  and `editable-text.tsx` and `markdown.tsx` are this app's own components that
  happen to live in that folder, so they are excluded from the override.
  `src/example/*.json` is excluded from the *formatter* for the same kind of
  reason: those are shipped circuits written minified by the exporter and the
  circuit skill.
- Extract a hook once logic passes ~30 lines of state wrangling — see
  `use-canvas-mouse-actions.ts`.
- Comment *why*, not *what*. The canvas code documents its non-obvious maths
  (DPR scaling, world↔mini projection); match that bar and no more.

## Accessibility

Nodes are DOM elements specifically so this is achievable — please don't
squander it. Interactive elements are focusable and labelled, every mouse
action has a keyboard path, and signal state is never communicated by colour
alone (`X` gets a marker, not just red). Guard new keyboard shortcuts against
text inputs by reusing the `isEditableTarget` pattern in
`use-canvas-mouse-actions.ts` rather than writing a second one.

## Docs go in the same commit

If your change contradicts a design doc, update the doc in the same commit. If
it reverses a decision, add an ADR in [artifacts/decisions/](artifacts/decisions/)
explaining why. Never leave code and docs disagreeing — the next person will
believe the doc. Tick the checkboxes and update the Known issues table in
[08-roadmap.md](artifacts/08-roadmap.md) as part of the work.

## Commits and pull requests

Commit messages follow Conventional Commits — `feat:`, `fix:`, `docs:`,
`refactor:`, `test:`, `chore:` — with a short imperative subject:

```
feat: add a D latch to the sequential family
fix: wire hit-testing misses branches at high zoom
```

Branch off `main`, keep a PR to one coherent change, and in the description say
what changed, why, and how you verified it. Before you open it:

- [ ] `bun run lint` passes
- [ ] `bun run test` passes
- [ ] `bun run build` passes
- [ ] Docs in `artifacts/` updated if intent changed; ADR added if a decision
      was reversed
- [ ] Roadmap checkboxes and Known issues updated
- [ ] New UI is keyboard-reachable and works in both themes

If part of the work is blocked, ship the rest and say plainly in the PR what
you left out and why. That is more useful than a PR that quietly does less than
it claims.

## Reporting bugs and asking for features

Open an issue. For a bug, the circuit that triggers it is worth more than a
paragraph describing it — attach the `.logits.json`, say what you expected and
what happened, and include the browser. For a feature, say what you are trying
to build and why the current node set cannot do it; that frames it better than
a proposed implementation, and it may turn out to be a node rather than a
feature.

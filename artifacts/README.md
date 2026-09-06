# Artifacts

Design documents for **Logits**, an interactive logic-gate design and simulation
canvas. These are the source of truth for *intent*; the code is the source of
truth for *what exists today*. When they disagree, fix one of them in the same
change.

| Doc | Read it when |
| --- | --- |
| [01-product-spec.md](01-product-spec.md) | You need to know what the app is supposed to do, and what is deliberately out of scope. |
| [02-architecture.md](02-architecture.md) | You are adding a module, deciding where a file goes, or touching the layer boundaries. |
| [03-data-model.md](03-data-model.md) | You touch the circuit document, netlist derivation, or the save format. |
| [04-simulation-engine.md](04-simulation-engine.md) | You touch anything under `src/lib/sim/` or write a node's `evaluate`. |
| [05-node-authoring-guide.md](05-node-authoring-guide.md) | You are adding a gate, clock, display, or any other node. **Always read this before adding a node.** |
| [06-node-catalog.md](06-node-catalog.md) | You need the agreed pin layout / parameters for a specific node. |
| [07-interaction-spec.md](07-interaction-spec.md) | You touch canvas input, wiring gestures, selection, or keyboard shortcuts. |
| [08-roadmap.md](08-roadmap.md) | You are picking up work, or finished a phase. |
| [decisions/](decisions/) | You want to know *why* something is the way it is, or you are reversing a decision. |

## Rules for this directory

- Keep docs short and decision-dense. No tutorials, no restating React or Next.js docs.
- Prefer a table or a code block over prose.
- A decision that constrains future work goes in `decisions/` as an ADR, not
  buried in a spec. ADRs are append-only: supersede, never rewrite history.
- Status markers used across these docs: **Built** (exists in `src/`),
  **Planned** (agreed, not written), **Open** (undecided — ask or write an ADR).

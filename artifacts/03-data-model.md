# Data model

All types live in `src/lib/circuit/`. They are plain serialisable data — no
class instances, no functions, no `Map`/`Set` inside the document.

## Document

```ts
type CircuitDocument = {
  version: number;              // schema version, bump + migrate on change
  id: string;
  name: string;
  nodes: Record<NodeId, CircuitNode>;
  wires: Record<WireId, Wire>;
  subcircuits?: Record<string, CircuitDocument>;  // user-defined chips (phase 4)
};

type CircuitNode = {
  id: NodeId;
  type: string;                 // registry key, e.g. "gate.and"
  position: Point;              // world coords of the node's top-left
  rotation?: 0 | 90 | 180 | 270;
  label?: string;
  params: Record<string, JsonValue>;   // validated against the definition
};

type Wire = {
  id: WireId;
  from: PinRef;                 // an output or inout pin
  to: PinRef;                   // an input or inout pin
  waypoints?: Point[];          // optional manual routing
};

type PinRef = { nodeId: NodeId; pinId: string };
```

Ids are opaque strings from `src/lib/circuit/ids.ts` (`nanoid`-style, no
counters — counters collide on paste and merge).

**Positions are world coordinates in canvas units**, not pixels; zoom does not
change them. Nodes snap to a 10-unit grid, matching `GRID_SIZE` in
[canvas-grid.tsx](../src/components/canvas/canvas-grid.tsx).

## Pins

Pins are declared by the node *definition*, never stored in the document — that
way changing a gate's pin layout does not require migrating saved circuits.

```ts
type PinSpec = {
  id: string;                   // stable within the node type; never renamed
  name: string;                 // shown in tooltips
  direction: "in" | "out" | "inout";
  width: number;                // 1..64
  side: "left" | "right" | "top" | "bottom";
  offset: number;               // position along that side, in grid units
};
```

`pinId` values are part of the save format. Renaming one is a breaking change
that needs a migration.

## Netlist (derived, never stored)

`buildNetlist(doc)` in `src/lib/circuit/netlist.ts` compiles the document into
the flat form the engine executes:

- Union-find over wires groups connected pins into **nets**.
- A net's width is the width of its pins; mismatched widths are a **validation
  error**, surfaced on the wire, not silently coerced.
- Each net records its driver pins (outputs/inouts) and reader pins (inputs/inouts).
- Nets get dense integer indices so the engine can use typed arrays.
- Output produced: `{ nets, nodes, pinToNet, netToReaders, diagnostics }`.

`buildNetlist` is pure and must stay pure — it is the easiest thing in the
codebase to unit test, so test it.

## Validation

Diagnostics are data, not exceptions. A circuit with errors still loads and
still renders; the offending element is marked.

| Code | Meaning |
| --- | --- |
| `width-mismatch` | Wire joins pins of different widths |
| `multiple-drivers` | Two non-tri-state outputs on one net (net resolves to `X`) |
| `undriven-input` | Input pin on a net with no driver (reads `Z`, then `X`) |
| `unknown-node-type` | Document references a type missing from the registry |
| `oscillation` | Engine hit the event budget without settling |

## Persistence

- File extension `.logits.json`; MIME `application/json`.
- Autosave the working document to `localStorage` under `logits:doc:<id>`,
  debounced with [use-debounced-callback.ts](../src/hooks/use-debounced-callback.ts).
- `serialize` / `deserialize` live in `src/lib/circuit/io.ts` and are the only
  code that knows about `version`.
- Every schema change adds a migration step `migrate_N_to_N+1`. Never change the
  meaning of an existing field in place.
- Deserialisation is defensive: an untrusted file must not be able to crash the
  editor. Unknown node types become placeholder nodes that preserve their params
  so the document round-trips without data loss.

# Data model

All types live in `src/lib/circuit/`. They are plain serialisable data — no
class instances, no functions, no `Map`/`Set` inside the document.

The **zod schemas in [schema.ts](../src/lib/circuit/schema.ts) are the source of
truth**; every type below is `z.infer`red from its schema so the two cannot
drift. The shapes are reproduced here as TypeScript for readability only. The
one hand-written type is `CircuitDocument["subcircuits"]`, because the schema is
recursive.

## Document

```ts
type CircuitDocument = {
  version: number;              // schema version, bump + migrate on change
  id: string;
  name: string;
  nodes: Record<NodeId, CircuitNode>;
  wires: Record<WireId, Wire>;
  defaultZoom?: number;         // scale this circuit opens at; absent = 100%
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
  waypoints?: Point[];          // the user's bends, absolute world coords
};

type PinRef = { nodeId: NodeId; pinId: string };
```

Ids are opaque strings from `src/lib/circuit/ids.ts` (`nanoid`-style, no
counters — counters collide on paste and merge).

`defaultZoom` is the one piece of *view* state the document owns, and it is a
setting rather than a running transform: the editor opens the circuit at that
scale and "reset view" returns to it, but pan and live zoom stay in the
viewport and are never written back. It is bounded by `MIN_SCALE`/`MAX_SCALE`
in [coords.ts](../src/lib/circuit/coords.ts) — the same limits the canvas
clamps to, so a file cannot ask for a scale that will not render — and absent
means 100%, so a circuit that never set one serialises exactly as it did
before the field existed. Edited through `setDefaultZoom`, like any other
command; the panel is
[project-settings-panel.tsx](../src/components/editor/project-settings-panel.tsx).

**Positions are world coordinates in canvas units**, not pixels; zoom does not
change them. Nodes snap to a 10-unit grid: `GRID_SIZE` in
[geometry.ts](../src/lib/circuit/geometry.ts), which
[canvas-grid.tsx](../src/components/canvas/canvas-grid.tsx) imports. One
definition — do not re-declare it.

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
  tristate?: boolean;           // output may drive Z — a bus driver, open drain
};
```

`tristate` is how `buildNetlist` tells a shared bus from a short without ever
looking at a node `type`. `inout` pins are tri-state by definition and need not
set it.

`pinId` values are part of the save format. Renaming one is a breaking change
that needs a migration.

## Geometry (derived, never stored)

Sizes, pin world coordinates and bounding boxes are computed into a **scene**,
never written to the document — see
[ADR 0004](decisions/0004-derived-scene-graph.md) for why storing them fails.
`pinOffsets` and friends in [geometry.ts](../src/lib/circuit/geometry.ts) are
pure and position-independent; [scene.ts](../src/state/scene.ts) assembles
`ResolvedNode` / `ResolvedWire` and owns the caches. Components render a
`ResolvedNode` and never do the maths themselves.

A wire stores only its **bends**. The polyline itself —
`ResolvedWire.points`, built by
[wire-path.ts](../src/lib/circuit/wire-path.ts) — is derived per render from
the pins plus the waypoints, so it follows the nodes automatically. Waypoints
are absolute and grid-snapped; a wire with none is auto-routed, and adding one
is what makes it manually routed. Every segment is axis-aligned, and the router
re-orthogonalises whatever it is given, so a saved path cannot come back
diagonal after a node moves.

## Netlist (derived, never stored)

`buildNetlist(doc, lookup)` in
[netlist.ts](../src/lib/circuit/netlist.ts) compiles the document into the flat
form the engine executes. It takes the registry lookup rather than importing it,
for the same reason the scene does: it can then be tested against pin layouts
the catalog does not have.

- Union-find over wires groups connected pins into **nets**. Every pin gets a
  net, wired or not — an unconnected input still has to read `Z`.
- A net's width is the width of its pins; mismatched widths are a **validation
  error**, surfaced on the wire, not silently coerced. The net is still built,
  at the widest pin's width, so no driver can overrun the engine's buffer.
- Each net records its driver pins (outputs/inouts) and reader pins (inputs/inouts).
- Nets get dense integer indices so the engine can use typed arrays. Node, wire
  and pin keys are **sorted** before any index is handed out, so one circuit
  always compiles to one numbering however its document was built up.
- An unknown node type keeps the pins its wires reference — the same
  synthesised strip the scene draws — so the nets around it still form and the
  rest of the circuit compiles.
- Output produced: `{ nets, nodes, pinToNet, netToReaders, diagnostics }`.
  `pinToNet` is keyed by `pinKey(nodeId, pinId)`.

`buildNetlist` is pure and must stay pure — it is the easiest thing in the
codebase to unit test, so test it.

## Validation

Diagnostics are data, not exceptions. A circuit with errors still loads and
still renders; the offending element is marked. Two kinds exist, and they are
separate: **load issues** (`LoadIssue` in [io.ts](../src/lib/circuit/io.ts))
describe a file that could not be read as written, and **circuit diagnostics**
below describe a circuit that reads fine but does not make sense.

| Load issue | Meaning |
| --- | --- |
| `invalid-json` / `not-an-object` | Not a document at all |
| `missing-version` / `unsupported-version` | No version, or newer than this build |
| `invalid-document` | Envelope failed validation; nothing recoverable |
| `invalid-node` / `invalid-wire` | One element dropped, the rest kept |
| `dangling-wire` | Wire references a node that is not in the document |

| Circuit diagnostic | Meaning |
| --- | --- |
| `width-mismatch` | Wire joins pins of different widths |
| `multiple-drivers` | Two non-tri-state outputs on one net (net resolves to `X`) |
| `undriven-input` | Input pin on a net with no driver (reads `Z`, then `X`) |
| `unknown-node-type` | Document references a type missing from the registry |
| `unknown-pin` | Wire lands on a pin the definition no longer declares |
| `oscillation` | Engine hit the event budget without settling |

Each carries a `severity` (`undriven-input` is a warning, the rest are errors)
and the `nodeIds` / `wireIds` / `pins` / `netId` the editor should mark.

## Persistence

- File extension `.logits.json`; MIME `application/json`.
- Autosave the working document to `localStorage` under `logits:doc:<id>`,
  debounced inside [document.ts](../src/state/document.ts) rather than with
  `useDebouncedCallback`: a pending edit must still be written when the editor
  unmounts, which a component-owned timer cannot promise. The store also
  flushes on `beforeunload` and before it swaps documents.
  A project index for the sidebar lives under `logits:index` as
  `{ version, projects: ProjectMeta[] }`, derived from documents on save.
- `serialize` / `deserialize` live in `src/lib/circuit/io.ts` and are the only
  code that knows about `version`. They are pure and take strings — the
  `localStorage` calls live in [src/state/storage.ts](../src/state/storage.ts),
  so replacing the store never touches the domain layer.
- Every schema change adds a migration step `migrate_N_to_N+1`. Never change the
  meaning of an existing field in place.
- Deserialisation is defensive: an untrusted file must not be able to crash the
  editor. `deserialize` never throws; it returns
  `{ ok, document, issues }` and parses element by element, so one corrupt node
  does not cost you the rest of the circuit. Unknown node types are preserved
  verbatim and become placeholder nodes at the registry, not in the schema —
  validating them away would discard params that must round-trip.

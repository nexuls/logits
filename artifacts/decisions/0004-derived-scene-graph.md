# 0004. Derived scene graph, not geometry in the document

Status: Accepted
Date: 2026-09-07

## Context

Rendering a node needs its size, its pin positions in world coordinates, and
its bounding box. All three follow from the node's `params`, `position` and
`rotation` plus the definition's `pins()` and `size()`. Recomputing them in
every component — the node layer, the wire layer, hit-testing, the minimap —
means the same maths in four places and a registry lookup per component.

The tempting fix is to cache the results on the `CircuitNode` itself. That
fails for three reasons:

- Pin layout depends on the *definition*, which lives in code, not in the file.
  A cached position written to disk goes stale the day a gate's `size()`
  changes, and nothing can detect the disagreement — wires render into empty
  space with no error.
- Anything on the node is in the save format, so a layout tweak becomes a
  migration.
- Every mutation goes through a command (non-negotiable #9). Geometry written
  during render either bypasses commands, desyncing undo and autosave, or does
  not, making each frame of a drag an undo entry.

## Decision

Geometry is derived into a **scene**, in the same category as the netlist:
computed from the document, cached in memory, never serialised.

- `src/lib/circuit/geometry.ts` — pure placement maths. Owns `GRID_SIZE`.
- `src/state/scene.ts` — `ResolvedNode` / `ResolvedWire`, and the caches.

The cache is split by what each half depends on. Size and pin *offsets* are a
function of `(type, params, rotation)` and **not** of `position`; world
coordinates are the offset plus the position, two additions. Resolved nodes are
additionally keyed by node object identity in a `WeakMap`.

Components consume `ResolvedNode`. They do not call the registry, do not call
`pins()`, and do not convert coordinates.

## Consequences

- Dragging a node is cache-*hit* work: position is not part of the layout key,
  so the expensive path does not re-run per frame. Identical nodes share one
  entry.
- Commands replace node objects immutably, so `WeakMap` identity is an exact
  change test that evicts itself on delete — no dirty flags, no revision counters.
- Rule #4 becomes enforceable: nothing downstream of the scene sees a `type`
  string, so nothing downstream can branch on one.
- Unknown node types resolve to a placeholder whose pins are reconstructed from
  the wires referencing them, so an unrecognised node still renders connected.
- Cost: the scene is a second representation to keep in step, and a stale cache
  is now a possible bug class. Mitigated by keying on everything that is read.
- Rules out storing pin positions, sizes or bounds in `CircuitDocument`, and
  rules out a component computing them for itself.

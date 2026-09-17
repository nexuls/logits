# 0012. Editing a chip is a path into the project

Status: Accepted
Date: 2026-09-17

## Context

[ADR 0010](0010-subcircuits-are-derived-node-types.md) settled what a chip
*is* — a document under the root's `subcircuits`, instantiated as a node typed
`sub.<key>` — and left the authoring surface open. Building it raised one
question that decides the shape of everything else: when the user opens a chip
to edit its contents, what is "the open document"?

Two answers were available.

**A second editor.** Mount another `Editor` on the chip, with its own document
store, history stack and simulation. It is the obvious reading of "open a chip
in a new tab", and it is what a modal chip editor would be.

It costs more than it looks. A chip is not a project: it has no storage of its
own, so its store would have to write back through the parent's on every edit,
and the two histories would have to be reconciled — `Ctrl+Z` inside a chip
either cannot undo the edit that created it or can, and then the outer stack is
holding a document whose chip no longer matches. Autosave would need a second
debounce. Every store that is a module singleton today — selection, in-place
edit, the default simulation — would need a second instance or a provider.

**A path into the same project.** The document store keeps the root project and
a list of chip keys. `getDocument()` returns the chip while one is open, and the
write-back puts the edited chip into the root's library as part of the same
`apply` that every other command goes through.

## Decision

**Editing a chip is a path, not a second editor.** `src/state/document.ts`
holds `editPath` — chip keys, outermost first — and `getDocument()` resolves it.
`openSubcircuit` / `closeSubcircuit` / `closeAllSubcircuits` move along it.

**Every command already written keeps working, unchanged.** They take a
document and return one; which document they are handed is this module's
business. `apply` writes the result back with `putSubcircuit` when a chip is
open, so undo and autosave still have exactly one hook each (Non-negotiable #9).

**History, autosave, the project id and `defaultZoom` stay the root's.** A chip
is not a thing that can be saved, or lost, on its own. One consequence is worth
stating plainly: `Ctrl+Z` works across the boundary, and an undo that removes
the chip you are inside steps you back out — `normalizeEditPath` drops any
trailing key the project no longer defines, on every commit, undo and redo.

**The open chip is handed the root's library.** A chip may instantiate other
chips, and they all live at the root, so `getDocument()` returns the chip with
`subcircuits` grafted on. It is stripped again on the way back in, so a chip
never stores a copy of the library it lives in. A library-level command issued
from inside a chip — making a chip out of a selection in there — therefore
writes its new chip to the root, because the library it was handed *is* the
root's.

**Anything that means "the project" says so.** `getRootDocument` exists for
exactly that, and export, duplicate, share, delete-project and the project
settings panel all use it. Reading `getDocument().id` to identify the project is
now a bug, and was fixed in the four places that did it.

**A chip may not be placed inside itself.** `canInstantiate` answers that
against the path, and the palette and command menu leave those entries out. The
`subcircuit-recursion` diagnostic stays as the backstop for a hand-written
file, but a diagnostic is the wrong answer to a placement the editor could have
refused.

## Consequences

The editor is one editor. There is no second simulation, no second history, and
no provider plumbing — but also no way to see a chip and its parent at the same
time, which a second editor would have given for free. Stepping out and back in
is the only comparison available.

**A chip is simulated on its own while it is open.** Nothing drives its input
ports, so they read `Z` and so, usually, does everything downstream of them. It
is honest — that is what the circuit says — but it reads as a broken circuit,
so the canvas says so in a banner while a chip is open. Driving a chip from one
of its instances' actual inputs would mean simulating the parent and projecting
into the child, which is a much larger idea.

**Definition identity became load-bearing.** A registry definition is a module
singleton, so the scene could cache a node's resolved layout against
`(type, params, rotation)` and the node object alone. A chip's definition is
derived from the document, and renaming a port changes the pins of every
instance while leaving every instance *node* untouched — so both of the scene's
caches now key on the definition object as well
([scene.ts](../../src/state/scene.ts)), and the two places that build a lookup
memoise it on `document.subcircuits` rather than on the document. The second
half is not an optimisation for its own sake: a lookup rebuilt per keystroke
hands out new definitions per keystroke, which would invalidate the layout of
every instance on the canvas on every edit.

Chip documents get their own `id`, so the per-project viewport store keys a view
per chip. That is what makes stepping into a chip return to where it was left,
and it means deleting a chip leaves one `logits:view:<id>` key behind.

The path is workspace state, not document state: it is not in the save format,
and reopening a project opens it at its root.

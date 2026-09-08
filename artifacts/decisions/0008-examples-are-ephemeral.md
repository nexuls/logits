# 0008. Examples open ephemeral, and importing is the only way to keep one

Status: Accepted
Date: 2026-09-08

## Context

The app ships example circuits ([08-roadmap.md](../08-roadmap.md), phase 5) so
a first-time user has something to open other than an empty grid. That raises a
question the project list does not: what *is* an example, as far as storage is
concerned?

Three options were on the table.

**Seed them into `localStorage` on first run.** The sidebar would then need no
new concept — an example is just a project. But it puts six circuits the user
never asked for into their list, they cannot be got back once deleted, and a
new example in a later release either never reaches an existing user or
silently reappears after they deleted it. Seeding also has to decide what
"first run" means in a browser whose storage was cleared.

**Open them read-only.** Honest about the storage story, but it defeats the
point: the value of an example is flipping its switches and cutting a wire to
see what breaks. Read-only would also have to reach into the canvas, the
gestures and the inspector to disable editing, which is exactly the kind of
mode the editor does not otherwise have.

**Open them editable but never write them.**

## Decision

**An example is a compiled-in document that opens *ephemeral*: fully editable,
undoable and simulatable, but never written to storage.**

The gate is a single flag in [document.ts](../../src/state/document.ts), read by
`scheduleSave` and nowhere else. Commands, history, the netlist, the simulation
and every component are unchanged and do not know an example from a project —
there is no read-only mode to thread through the editor.

`openDocument(id)` resolves an id against storage first and the example
catalogue second, so the editor asks for an id and never has to know which kind
it got, and a real project can never be shadowed by an example.

**Importing is the one action that turns an example into a project**, and it
imports what is *on screen*, not the file on disk — an example is editable, so
importing the pristine copy would discard the edits the user is asking to keep.
The copy gets a fresh document id, so importing twice gives two independent
projects.

The files live in [`src/example/`](../../src/example/) as ordinary
`.logits.json` documents with an `index.ts` that validates them through
`fromJson` at module load. Nothing about their format is special: an example
can be exported from the editor, hand-tuned and dropped straight back in.

## Consequences

- **Edits to an example are lost when the user switches away.** That is the
  honest consequence of never having saved, but it is not guessable from the
  canvas, so the editor shows a badge while an ephemeral document is open. A
  "you have unsaved changes" prompt on switching away is the obvious next step
  and is deliberately not built yet.
- Examples are shipped code, not user data. Adding one is a JSON file and a
  line in `src/example/index.ts`; it reaches every user on the next deploy, and
  no user can delete one.
- The example ids (`ex_*`) are part of no save format — an imported copy gets a
  new id — so they are free to change. Nothing may parse them; membership is a
  `Map` lookup in the catalogue.
- The catalogue is bundled into the client, so every example's JSON is in the
  initial payload. Six small circuits is nothing; a large library would need
  them fetched instead.
- Routing, when it lands, has to treat an example id as a valid URL for a
  document that is in no project list.

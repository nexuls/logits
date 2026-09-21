# 0014. An optional online assistant, and the one server route it needs

Status: Accepted
Date: 2026-09-21

Narrows, without reversing, the "no backend" line in
[01-product-spec.md](../01-product-spec.md): the editor stays local-first and
needs no server; one optional feature does.

## Context

Users want to ask for edits in words — "place a 16×16 matrix display, a 16×16
draw pad, and connect the pins" — and have them happen on the canvas, later by
voice as well as typed.

That needs a language model, and the model has to be called with an API key.
A key in the browser is a key anyone can copy, so there has to be something on
a server. The product spec says no to a backend, and that line exists to keep
the editor working offline, with no account, from a plain JSON file.

The model is **Jev**, TypeSafe's System One model. It does not write text: it
answers typed questions — pick one of these options — with calibrated
probabilities. That fits an editor whose edits are already a closed set of
commands. The chat can ask what a sentence means and code can do it; nothing
generated is executed, and the model cannot produce an edit a user could not
make by hand.

## Decision

- **One server route, `/api/assistant`**, and nothing else server-side. It
  holds the TypeSafe key (`TYPESAFE_API_KEY`), turns a message into a *plan* —
  data naming editor commands — and returns it. It reads no storage, keeps no
  state, and is sent element types, labels and the selection, never a whole
  document.
- **The document only changes on the client**, through
  `applyAssistantSteps` in `src/state/document.ts`, as one undo step. The plan
  is checked against the document as it is when the answer arrives.
- **Optional by construction.** Nothing in the editor imports the assistant
  but the sidebar that mounts it. Offline, with no key configured, or with
  TypeSafe unreachable, the chat says so and disables its input; every other
  feature is unchanged. A deployment without the key simply has no assistant.
- **Jev picks; code decides.** The interpreter in `src/lib/assistant/` asks
  Choice questions built from the registry's own titles, docs and
  `paramsSchema` — so a new node is something the assistant can place and
  configure with no change there (Non-negotiable #3) — and owns the rules for
  resolving "them", the order of wires, and the confidence below which it
  asks back instead of acting. A request is done whole or not at all.
- **Values are selected, not generated.** Numbers and quoted text are found in
  the request by code, and Jev chooses among them.

## Consequences

- The app now has a server-side dependency *for one feature*. A static export
  would lose the assistant and nothing else.
- Circuit element types and labels, and the text typed into the chat, are sent
  to TypeSafe. The chat states that it needs the internet; a privacy note
  belongs wherever the app is deployed with a key.
- Anyone who can reach a deployment with a key can spend it through the route.
  Requests are bounded (500 characters, 200 elements, at most two System One
  calls each), but there is no rate limit of the app's own yet.
- Jev reads English best; other languages work with lower accuracy.
- Voice input is a transcript fed to the same `send`; it needs no change to
  the route or the interpreter.

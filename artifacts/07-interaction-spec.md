# Interaction spec

Everything below is **built**: the viewport in
[src/components/canvas/](../src/components/canvas/), the editing gestures in
[use-editor-gestures.ts](../src/components/editor/use-editor-gestures.ts) and
[use-editor-shortcuts.ts](../src/components/editor/use-editor-shortcuts.ts).
Do not change a built gesture without an ADR — muscle memory is a feature.

## Viewport (built)

| Gesture | Action |
| --- | --- |
| Wheel / two-finger scroll | Pan |
| Shift + wheel | Pan horizontally |
| Ctrl/Cmd + wheel, pinch | Zoom at pointer |
| Middle-drag, Space + drag | Pan |
| One-finger drag (touch) | Pan |
| Two-finger pinch (touch) | Zoom + pan |
| Double-click empty canvas | Reset view |

Zoom is clamped to `0.05`–`8` (`MIN_SCALE`/`MAX_SCALE` in
[coords.ts](../src/lib/circuit/coords.ts)). Native wheel is prevented on the
viewport so the page never scrolls behind the canvas.

**Reset view** goes to the project's `defaultZoom`, not to 100%, and the
minimap's percentage button is labelled with that target. Opening a circuit
frames it at the same scale. Editing the setting does *not* move the current
view — a preference change must not yank the canvas out from under an edit in
progress; it applies at the next reset or open.

The `--logit-cursor-*` custom properties the canvas uses are defined in
[globals.css](../src/app/globals.css); each falls back to the standard keyword,
so a browser that rejects the image cursor still shows the right shape. The
editor adds `--logit-cursor-cross` while placing or wiring and
`--logit-cursor-move` while dragging.

## Panels (built)

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + B` | Toggle the projects sidebar (left) |
| `Ctrl/Cmd + J` | Toggle the elements sidebar (right), between full width and its icon rail |

The two sidebars are independent — separate providers, separate cookies,
separate shortcuts. Both are also reachable by pointer: the left one from the
canvas header, the right one from the panel button in its own header.

## Editing

| Gesture | Action |
| --- | --- |
| Click a palette element, then click the canvas / `Ctrl+K` command menu | Place a node. The command menu places at the last pointer position |
| Click an armed palette element again | Arm one more copy, up to 6. Right-click (or `-`/`ArrowDown` on the focused entry) takes one back off; down past one disarms |
| Move the pointer over the canvas while armed | A dashed ghost of the batch follows the cursor, drawn at the snapped positions the click will use. It is one undo step however many copies land |
| Left-drag on a node | Move (snapped to the 10-unit grid; hold `Alt` to bypass) |
| Left-drag on empty canvas | Rubber-band select |
| Shift/Ctrl + click | Add to / toggle selection |
| Drag from a pin | Start a wire; drop on a compatible pin to connect |
| `Esc` while wiring | Cancel |
| Click a wire | Select it; `Delete` removes it |
| Drag a wire segment | Bend it. Moves along its one free axis only, snapped to the grid; the pin ends stay anchored, so dragging an end segment splits a new bend off it |
| Drag a bend onto its neighbours | Straightens the wire — collinear points collapse, so a wire cannot accumulate invisible bends |
| Click a node | Select it; its parameters appear in the inspector |
| `Tab` | Move through node bodies and pins; focusing a node selects it |
| `Enter` on a pin | Start a wire, then `Enter` on a second pin to finish it |
| Click an `io.switch` / `io.button` | Toggle / press. It works while paused too — the engine settles the edit — and the position is a param, so it undoes |
| `R` | Rotate selection 90° |
| `Ctrl+D` | Duplicate |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste (paste at pointer, new ids) |
| `Ctrl+X` | Cut |
| `Space` (tap) | Play / pause simulation. A *held* space is the pan gesture; the tap is a short press with no pointer down during it |
| `.` | Single step |
| `Ctrl+S` | Save document (it autosaves anyway; this flushes now) |
| `Ctrl+K` | Command menu |
| `Esc` | Cancel the armed node type, then a wire in progress, then the selection |

Never bind a plain letter key while a text input or `contentEditable` has focus.
`use-canvas-mouse-actions.ts` already has an `isEditableTarget` guard — reuse
that helper rather than writing a second one.

## Wiring rules

- A drag may start from any pin, in either direction; the engine does not care
  which end was drawn first, but the stored `Wire.from` must be the driver
  (output/inout) where one is unambiguous.
- While dragging, highlight compatible pins (matching width, opposite direction)
  and dim incompatible ones. Snap within ~10 screen px.
- Dropping on empty canvas leaves the wire drawn and marked unresolved rather
  than discarding it: the schema has no dangling wire, so it is not written to
  the document, but it stays on screen in the error style until the user lands
  it on a pin or presses `Esc`.
- Connecting two pins of different widths is allowed but produces a
  `width-mismatch` diagnostic on the wire. Do not auto-truncate.
- Wires route orthogonally (Manhattan) by default with a simple two-bend path;
  manual waypoints override. Storing a waypoint *is* what makes a wire manually
  routed — there is no separate mode flag to fall out of step with the geometry.
- When the target pin sits behind the source pin, the default route detours
  around rather than doubling back across the node it just left. Feedback is
  not an edge case in this app; every latch and oscillator has some.
- The router has no obstacle avoidance: a wire may cross a node, and the fix is
  for the user to bend it. Auto-routing around nodes is deliberately out of scope.
- Waypoints are absolute world coordinates, so moving a node does not drag its
  wires' bends along. The path re-orthogonalises itself instead — a hand-routed
  wire stays legal after the node at one end moves, it just may not stay pretty.

## Feedback

- Wire colour encodes the resolved value: `0` dim, `1` bright/accent, `X` red,
  `Z` grey-dashed. Multi-bit buses draw thicker and show the value on hover.
- Never rely on colour alone: `X` gets a `!` on the wire and a badge on the
  node, a floating net gets `~`, and every diagnostic is a row in the
  diagnostics panel that selects the element it is about when clicked.
- Every action reachable by keyboard is also reachable by menu or toolbar.
- Node bodies are focusable and expose `role`/`aria-label`; the canvas itself is
  `role="application"` (already set).

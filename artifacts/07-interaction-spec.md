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
| Click a pin | Start a wire. It follows the cursor until it lands |
| Click empty canvas while wiring | Drop a bend there, snapped to the grid, and keep drawing |
| Click a second pin | Connect. The bends dropped on the way are stored with the wire, in the same undo step |
| Drag from a pin to a pin | Connects in one gesture, as before. Releasing anywhere else just leaves the wire armed and following the cursor |
| `Esc` while wiring | Cancel |
| Click a wire | Select it; `Delete` removes it. Its bends appear as handles |
| Hover a wire | A hollow handle follows the cursor along the wire, at the nearest point on it, showing where a bend would go |
| Drag from a wire | Adds a bend at the point pressed and drags it, in one undo step. A click alone only selects — the wire body is not draggable |
| Drag a bend handle | Moves that waypoint, snapped to the grid. Handles are only grabbable while their wire is selected |
| Drop a bend onto its neighbour | Removes it, straightening the wire. The only way to delete a bend short of deleting the wire |
| Click a node | Select it; its parameters appear in the inspector popover, anchored over the node itself |
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

- A wire may start from any pin, in either direction; the engine does not care
  which end was drawn first, but the stored `Wire.from` must be the driver
  (output/inout) where one is unambiguous. When the two ends are swapped to put
  the driver first, the bends drawn along the way are reversed with them.
- While a wire is in progress, highlight compatible pins (matching width,
  opposite direction) and dim incompatible ones. Snap within ~14 screen px.
- A wire in progress owns the click: on a pin it lands, anywhere else it drops a
  bend. It ends only on a pin or on `Esc` — a release on empty canvas is not a
  failed drop, it is the middle of drawing. The error style is for a *refused*
  connection, and clears as soon as the user does something else.
- Connecting two pins of different widths is allowed but produces a
  `width-mismatch` diagnostic on the wire. Do not auto-truncate.
- Segments run at any angle — horizontal, vertical or diagonal (ADR 0006). A
  wire is a one-cell stub off each pin, so it leaves the node body
  perpendicular, and straight runs through every waypoint. There is no
  auto-inserted bend: with no waypoints a wire is a single straight line.
  Storing a waypoint *is* what makes a wire manually routed — there is no
  separate mode flag to fall out of step with the geometry.
- Bends are drawn rounded. The rounding is a rendering step (`smoothPath`) over
  the polyline, never a change to it: what is clickable is the polyline, so the
  curve cannot disagree with the hit target.
- A bend is edited as a waypoint, never as a segment ([ADR
  0007](decisions/0007-waypoint-handles.md)). The gesture edits
  `Wire.waypoints` directly; the polyline is never read back out into
  waypoints, so a bend cannot drift through a round trip. The router reports,
  per segment, which index a bend dropped there takes, and a waypoint stays a
  vertex of the route even when it falls on a straight run — a handle the user
  placed must stay where they can grab it.
- The router has no obstacle avoidance: a wire may cross a node, and the fix is
  for the user to bend it. Auto-routing around nodes is deliberately out of scope.
- Waypoints are absolute world coordinates, so moving a node does not drag its
  wires' bends along. The wire re-aims its end segments at the pins instead — a
  hand-routed wire stays attached after the node at one end moves, it just may
  not stay pretty.

## Feedback

- Wire colour encodes the resolved value: `0` dim, `1` bright/accent, `X` red,
  `Z` grey-dashed. Multi-bit buses draw thicker and show the value on hover.
  Stroke widths are in screen pixels (`vector-effect: non-scaling-stroke`), so a
  wire is the same weight at every zoom. The value label sits at the middle of
  the wire's *longest* segment, which on a diagonal route is the only place it
  is reliably clear of both nodes.
- Never rely on colour alone: `X` gets a `!` on the wire and a badge on the
  node, a floating net gets `~`, and every diagnostic is a row in the
  diagnostics panel that selects the element it is about when clicked.
- Every action reachable by keyboard is also reachable by menu or toolbar.
- Node bodies are focusable and expose `role`/`aria-label`; the canvas itself is
  `role="application"` (already set).

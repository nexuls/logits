# Interaction spec

The viewport gestures below are **Built** in
[src/components/canvas/](../src/components/canvas/); everything else is Planned.
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

Zoom is clamped to `0.05`–`8`. Native wheel is prevented on the viewport so the
page never scrolls behind the canvas.

Note: the canvas references `--logit-cursor-default`, `--logit-cursor-grab` and
`--logit-cursor-grabbing`, which are **not defined** in
[globals.css](../src/app/globals.css). Either define them or fall back to the
standard keywords — see [08-roadmap.md](08-roadmap.md).

## Editing (planned)

| Gesture | Action |
| --- | --- |
| Drag from palette / `Ctrl+K` command menu | Place a node |
| Left-drag on a node | Move (snapped to the 10-unit grid; hold `Alt` to bypass) |
| Left-drag on empty canvas | Rubber-band select |
| Shift/Ctrl + click | Add to / toggle selection |
| Drag from a pin | Start a wire; drop on a compatible pin to connect |
| `Esc` while wiring | Cancel |
| Click a wire | Select it; `Delete` removes it |
| Drag a wire segment | Bend it. Moves along its one free axis only, snapped to the grid; the pin ends stay anchored, so dragging an end segment splits a new bend off it |
| Drag a bend onto its neighbours | Straightens the wire — collinear points collapse, so a wire cannot accumulate invisible bends |
| Double-click a node | Focus its primary parameter in the inspector |
| Click an `io.switch` / `io.button` | Toggle / press (only while simulating) |
| `R` | Rotate selection 90° |
| `Ctrl+D` | Duplicate |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste (paste at pointer, new ids) |
| `Space` (tap) | Play / pause simulation |
| `.` | Single step |
| `Ctrl+S` | Save document |

Never bind a plain letter key while a text input or `contentEditable` has focus.
`use-canvas-mouse-actions.ts` already has an `isEditableTarget` guard — reuse
that helper rather than writing a second one.

## Wiring rules

- A drag may start from any pin, in either direction; the engine does not care
  which end was drawn first, but the stored `Wire.from` must be the driver
  (output/inout) where one is unambiguous.
- While dragging, highlight compatible pins (matching width, opposite direction)
  and dim incompatible ones. Snap within ~10 screen px.
- Dropping on empty canvas leaves the wire unconnected — show it as an error,
  do not silently delete the user's work.
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
- Never rely on colour alone: `X` also gets a marker on the wire, and errors are
  listed in a diagnostics panel that can focus the offending element.
- Every action reachable by keyboard is also reachable by menu or toolbar.
- Node bodies are focusable and expose `role`/`aria-label`; the canvas itself is
  `role="application"` (already set).

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

The **performance monitor** is on screen as a one-line status bar in
the bottom-right corner — FPS, TPS (simulation events per second), input
latency, and simulation speed as a share of the requested speed. A value past
its threshold turns red *and* gains a warning icon. The activity button in the
toolbar, or the chevron on the bar itself, grows the same box upward into the
detailed view (trend sparklines with hover readouts, then rendering, simulation,
input and circuit figures as text). The transition is skipped under
`prefers-reduced-motion`, and the collapsed details are `inert`. The diagnostics
panel stacks above it in the same corner.

The two sidebars are independent — separate providers, separate cookies,
separate shortcuts. Both are also reachable by pointer: the left one from the
canvas header, the right one from the panel button in its own header.

## Narrow canvases (built)

The floating chrome sizes itself against the **canvas**, not the viewport: both
sidebars change how much canvas there is without the viewport changing at all,
so a viewport breakpoint gets this wrong with a sidebar open. `src/components/canvas/`
is a named container (`@container/canvas`) and everything on it uses
`@min-[…]/canvas` / `@max-[…]/canvas`. Each threshold is the width below which
two pieces of chrome would genuinely collide, measured, not a device size.

| Canvas width | What changes |
| --- | --- |
| `< 64rem` | **The toolbar turns on its side**: it leaves the top row, which the header and the share / elements buttons already hold, and becomes a rail down the right edge, **one icon wide**, centred in the band between them and the bottom chrome. Everything in it becomes a square icon button: the speed control shows a gauge (its value stays in the tooltip, in `aria-label` and checked in the menu), the diagnostics count drops to its tooltip, the rules turn with the bar, and the simulated-time readout goes (decorative, already `aria-hidden`). The header is capped at 20rem less the 8rem those buttons take; at `64rem` and up it is capped at 16rem instead, to stay clear of the centred toolbar |
| `< 48rem` | The performance monitor (26rem) and its toolbar toggle hide — it cannot share the bottom edge with the minimap (11rem) and the rail (~7.5rem), and the minimap wins because it carries the zoom controls. The diagnostics panel and the notice toast lift above the minimap band |

The toolbar scrolls along its own axis rather than bursting its box or
squashing its buttons. The "Example" banner and the placement hint share one
centred column, so two banners that are on screen together stack instead of
overlapping.

`Separator` takes its `orientation` at render, so the rail's rules are turned
in CSS by `ToolbarSeparator` — with `!`, which is what beats the primitive's
own `data-vertical:` sizing. The square-button overrides in the rail use `!`
for the same reason, against `buttonVariants`.

Tooltips point into the canvas, away from whichever edge the bar is against:
below the buttons across the top, to their **left** in the rail, where one
below would cover the next button down. `side` is a render-time prop, so
`Toolbar` reads its own computed `flex-direction` back through a
`ResizeObserver` and publishes it on a context the tooltips consume — the
container query stays the only place the 64rem threshold is written down. A
`ToolbarTooltip` outside a `Toolbar` (the share button) defaults to `bottom`.

The rail stops short of the bottom rather than the bottom chrome stepping
aside for it, so the status bar and the minimap stay **flush in their corners**,
which is the shape they are drawn for. Only what opens *upward* into the rail's
band insets to clear it: the diagnostics panel, and the performance monitor
once expanded.

Touch and small screens remain out of scope ([01-product-spec.md](01-product-spec.md)):
what is defended here is that the layout holds, not that the app is usable with
a finger. So the editor says so on arrival —
[device-warning-dialog.tsx](../src/components/editor/device-warning-dialog.tsx)
opens once when the viewport is under 768px wide or the device is touch-only
(`(pointer: coarse) and (hover: none)`, which spares a touchscreen laptop),
naming what does work (pan, zoom, run, tap a switch) and what does not
(placing, wiring, moving, shortcuts). Dismissing it is the acknowledgement,
stored per device as `deviceWarningDismissed` in editor settings, and the
dialog is deliberately not a wall: **Continue anyway** is the only button.

## Preview (built)

[`CircuitPreview`](../src/components/preview/circuit-preview.tsx) has the
viewport gestures above, less anything its props turn off (`pannable`,
`zoomable`), and none of the editing ones below.

| Input | Action |
| --- | --- |
| Left-drag anywhere | Pan — there is nothing to select, so the drag the editor spends on a rubber band pans instead |
| Click / press on a node view | Operates it (switch, button, keypad, keyboard, drawpad), unless `interactive` is off |
| `Space` (tap) | Run / pause, while focus is inside the preview and not on a control |
| `.` | Step one event, while focus is inside the preview |

Pressing anywhere in a preview focuses it, so its keys work straight after a
click. With both `pannable` and `zoomable` off the wheel and touch go back to
the page, so a fixed preview does not trap the scroll passing over it.

`/preview#data=<link data>` is a preview on a page of its own, for embedding in
an `<iframe>`: the whole frame, running on open, with the header, run controls
and diagnostics and without the performance monitor. It opens as the editor
does, at the circuit's origin and default zoom (**Set view as origin** and the
project's default zoom choose it), rather than fitted. The circuit appears once
the browser has decoded the fragment, and a changed fragment opens the new
circuit. Older `/preview?data=<base64>` links still open. Missing or unreadable
data shows a one-line explanation instead of a canvas.

## Menus (built)

**Canvas header menu** (the ⋯ beside the title,
[project-menu.tsx](../src/components/editor/project-menu.tsx)). It acts on the
open circuit; items that need one are disabled when none is open.

| Item | Action |
| --- | --- |
| New project | Creates a project, opens it, and puts the header title into rename |
| Rename | Puts the header title into rename (double-click on the title does the same) |
| Duplicate | Copies the open circuit, unsaved edits included, into a new project and opens it. On an example it reads **Save to projects** and does what the sidebar's import does |
| Set view as origin | Shifts every node and wire bend by the current pan offset (snapped to the grid) and pans the view back by the same amount, so nothing moves on screen but **Reset view** now returns here. One undo step; undo moves the circuit back but leaves the view where it is |
| Import / Export → Import circuit file… | Picks a `.json` file and adds it as a **new project** with a fresh id, then opens it. It never replaces the open circuit: a file exported from this browser carries its source project's id, and loading it under that id would overwrite that project on the next autosave |
| Import / Export → Export as JSON | Downloads the open circuit as `<name>.logits.json` |
| Copy link | Copies the open circuit's embeddable `/preview#data=` link, unsaved edits included. A snapshot: later edits need a new link. Same as the **Share** button |
| Settings → Preferences… / Project settings… | Opens the settings dialog on that tab |
| Keyboard shortcuts | Opens the shortcuts dialog (also `?`) |
| Welcome & tour | Replays the first-run welcome, and the guided tour from its last page |
| Delete project | Asks for confirmation, then deletes. Disabled on an example |

The toolbar's import and export buttons use the same code
([project-actions.ts](../src/components/projects/project-actions.ts)).

**Share** ([share-button.tsx](../src/components/editor/share-button.tsx)) sits
in the canvas's top-right corner, level with the toolbar, and does what
**Copy link** does; the result shows in the editor's notice. Below `md` it moves
left of the elements-sidebar trigger and shows only its icon.

**Project rows in the sidebar.** The ⋯ button and a right-click anywhere on the
row (a long-press on touch) open the same menu: Rename (`F2`), Duplicate,
Pin / Unpin, Export as JSON, Copy link (reported in a toast), Delete (`Delete`). Right-click is off while the row
is being renamed, so the name field keeps the browser's own menu. Under a **Logits**
heading, the top of the sidebar is the search field with a ⋯ button beside it, whose menu holds
**New project**, **Import circuit file…** and **Browse examples…**; the footer
holds a banner linking to the GitHub repository. An empty project list offers
**Browse examples** too.

**Examples dialog**
([examples-dialog.tsx](../src/components/projects/examples-dialog.tsx)). A
large dialog with every shipped example as a card: a static thumbnail drawn
from the circuit's scene, the name, a part count and the one-line summary.
Clicking a card (or Enter / Space on it) opens its preview beside the gallery —
side by side in a landscape window, stacked in a portrait one — as a
`CircuitPreview` that starts running and can be operated but not edited.
**Import** (or double-clicking a card) adds the example, as shipped, as a new
project, opens it and closes the dialog; a storage failure is shown in the
dialog and leaves it open. **Close preview** returns the gallery to full width,
and every opening starts at the gallery.

**Selection and the browser's menu.** Text in the app is not selectable, except
in inputs, textareas, the note editor and an element's docs dialog. The
browser's own context menu is suppressed everywhere except editable fields,
which keep it for paste and spell-check
([native-menu-guard.tsx](../src/components/native-menu-guard.tsx)). The guard
only prevents the default, so right-click still does what the canvas, the
palette and the project rows give it.

A menu item that moves focus into a name editor (New, Rename) does not hand
focus back to the menu trigger as the menu closes — that would blur the editor,
and a blur commits the rename before anything is typed.

## Editing

| Gesture | Action |
| --- | --- |
| Click a palette element, then click the canvas / `Ctrl+K` command menu | Place a node. The command menu places at the last pointer position |
| Click the info button on a palette element, or beside the title of the inspector popover | Open its help dialog — the definition's `docs`, plus pin and setting tables derived from the definition. In the palette the button appears on hover and whenever anything in the row has focus, so it is tabbable but quiet at rest; in the inspector it is always shown when a single node with a known definition is selected |
| Click an armed palette element again | Arm one more copy, up to 6. Right-click (or `-`/`ArrowDown` on the focused entry) takes one back off; down past one disarms |
| Move the pointer over the canvas while armed | A dashed ghost of the batch follows the cursor, drawn at the snapped positions the click will use. It is one undo step however many copies land |
| Left-drag on a node | Move (snapped to the 10-unit grid; hold `Alt` to bypass). A wire with *both* ends in the move travels whole, bends included; a wire with only one end in it stretches and keeps its bends where they are |
| Left-drag on empty canvas | Rubber-band select |
| Shift/Ctrl + click | Add to / toggle selection |
| Click a pin | Start a wire. It follows the cursor until it lands |
| Click empty canvas while wiring | Drop a bend there, snapped to the grid, and keep drawing |
| Click a second pin | Connect. The bends dropped on the way are stored with the wire, in the same undo step |
| Click a wire while wiring | Land on it: the wire is tapped where it was clicked and the two join there, as one undo step. The tap and the bends drawn on the way arrive with the wire, so `Ctrl+Z` takes the whole thing back |
| `Alt` + click a wire while wiring | Drops an ordinary bend there instead of joining, which is how a wire is routed *across* another one it does not connect to |
| Drag from a pin to a pin, or from a pin onto a wire | Connects in one gesture, as before. Releasing anywhere else just leaves the wire armed and following the cursor; a release that has not moved from where the wire was armed never lands, so the wires already meeting that pin are not joined by the click that started the drawing |
| `Esc` while wiring | Cancel |
| Click a wire | Select it; `Delete` removes it. Its bends appear as handles. A wire, a bend handle, or a pin that runs under a node body is covered by it: the press goes to the node, as it looks. The toolbar and panels floating over the canvas never pass a press through to what is beneath them |
| Right-click a wire, then drag | Branches from the point pressed: drops a bend there and arms a wire that starts at it, the same as a left-click on a pin — drag straight to a target pin to land in one gesture, or release early and keep drawing click by click. The bend is one undo step; the wire landed from it is a second, ordinary one. `Esc` abandons the wire and leaves the bend, which changes nothing about the circuit, so `Ctrl+Z` is what takes it back |
| Hover a wire | A hollow handle follows the cursor along the wire, at the nearest point on it, showing where a bend would go — or, while a wire is being drawn, where it would tap. The wire in progress snaps its end to that point, the same way it snaps to a pin |
| Drag from a wire | Adds a bend at the point pressed and drags it, in one undo step. A click alone only selects — the wire body is not draggable |
| Drag a bend handle | Moves that waypoint, snapped to the grid. Handles are only grabbable while their wire is selected |
| Drop a bend onto its neighbour | Removes it, straightening the wire. The only way to delete a bend short of deleting the wire |
| Click a node | Select it. The inspector popover, anchored over the node itself, opens on the *release*, not the press — so a press that turns into a drag never flashes a panel — and stays away for as long as any pointer gesture is held, which is what keeps it out of the way of the node being moved. It comes back where the selection ended up |
| Select a grouped node (a tunnel) | Every other member of its group — the rest of the network — gets a dashed highlight, a shape as well as a colour. The inspector's name field is a searchable list of the groups in the document; typing a name that is not there offers an "Add" row that creates it |
| `Tab` | Move through node bodies and pins; focusing a node selects it |
| `Enter` on a pin | Start a wire, then `Enter` on a second pin to finish it |
| `Enter` on a selected subcircuit instance | Open its contents — the keyboard path to the double-click |
| Click an `io.switch` / `io.button` | Toggle / press. It works while paused too — the engine settles the edit — and the position is a param, so it undoes |
| Click an `io.keyboard`, or `Enter` on it | Capture the keyboard: every key, `Space`/`Delete`/`Tab`/`Ctrl+Z` included, goes to the circuit and none reaches the editor. The configured exit chord (`Esc` by default, or `Shift+Esc` / `Ctrl+]`) hands it back and is not sent; a press outside the element or leaving the window also ends capture, releasing any held keys. The face reads *Typing* and shows the exit chord, so the mode is not told by the ring colour alone |
| Press and drag on an `io.drawpad` | Paint. The first pixel pressed flips, and the rest of the stroke sets every pixel it crosses to that same value, so one stroke only draws or only erases; one stroke is one undo step. Focused (`Tab`), the arrow keys move a cursor, `Shift`+arrow draws as it moves, and `Space`/`Enter` flips the pixel under the cursor. **Clear** on the face empties the pad |
| Drag a handle on a selected `deco.text` or `deco.group` | Resize it. Eight handles — corners and edge midpoints — appear while it is the only selection; the edge opposite the handle stays put, the moving edge snaps to the grid (`Alt` bypasses), and the size stops at the element's minimum rather than flipping. One drag is one undo step. The cursor shows the resize direction over a handle. **Width** and **Height** in the inspector are the keyboard path |
| Double-click a `deco.text`, press `Enter` while it is the only selection, or **Edit text** in the inspector | Edit it where it sits: the note becomes a Markdown editor (CodeMirror with draftly) that styles as you type and shows the marks only on the line with the caret. The inspector steps aside while it is open. Click anywhere outside it, press the check mark under the box, or press `Esc` / `Ctrl+Enter` to finish. The box grows taller as the text needs it and shrinks back as text is deleted, never below the height it started at (on a turned note, the axis that is vertical on screen). The edit — text and growth together — is one undo step. Keys typed into it — `Delete`, `Ctrl+Z`, `Space` — stay in the editor, and the wheel scrolls the text rather than the canvas |
| Press a `deco.group` | Only its header and its edge pick it up. Anywhere else inside it the press reaches what is there — a gate, a pin, a wire — or starts a rubber band on empty space, so the circuit inside a group edits exactly as it would without one. Wires paint above a group, so a wire crossing its header takes the press |
| Drag a `deco.group` | Moves it, and — with **Move contents** on, the default — everything lying wholly inside it when the drag starts, wires and their bends included. Something only overlapping its edge stays behind. A rubber band selects a group only when the band surrounds it |
| Double-click a subcircuit instance, press `Enter` while it is the only selection, or **Edit contents** in the inspector | Open the chip it is an instance of. The canvas then shows the chip's own circuit, with a trail bar at the top leading back out; every gesture and shortcut works there as it does at the top level. A chip is simulated on its own while it is open — nothing drives its input ports, so they read `Z`, and the canvas says so |
| Select part of a circuit, then `Ctrl+G` / **Make subcircuit** in the inspector / **Make subcircuit from selection** in `Ctrl+K` | Turns the selection into one of the project's chips, in its place. It asks for a name first and says how many parts will move and how many pins the boundary produces. The selected parts and the wires between them move into the chip; every wire that crossed the boundary stays and lands on a pin of the new instance. One undo step, chip and all |
| Rename a port inside a chip | Renames the pin on every instance of it, carrying the wires already landed on that pin — one undo step for the rename and the wires together. Deleting a port, or clearing its name, takes the pin away instead, and the wires on it go with it: a dangling wire is a load-time repair case, not something an edit creates |
| The ⋯ menu on a **Subcircuits** palette row | **Edit contents**, **Rename…**, **Delete** — and **About**, which every row has. Deleting takes every instance of the chip with it, as one undo step, and the confirmation says how many. Renaming changes only the name: the key is in the save format, so every instance keeps its wiring. A chip that cannot be placed where the user currently is — it would contain itself — is a disabled row that says so, not a missing one |
| `R` | Rotate selection 90° |
| `Ctrl+D` | Duplicate |
| `Ctrl+G` | Make the selection a subcircuit |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+C` / `Ctrl+V` | Copy / paste (paste at pointer, new ids) |
| `Ctrl+X` | Cut |
| `Space` (tap) | Play / pause simulation. A *held* space is the pan gesture; the tap is a short press with no pointer down during it |
| `.` | Single step |
| `Ctrl+S` | Save document (it autosaves anyway; this flushes now) |
| `Ctrl+K` | Command menu |
| `?` | Keyboard shortcuts dialog |
| `Esc` | Cancel the armed node type, then a wire in progress, then the selection |

Never bind a plain letter key while a text input or `contentEditable` has focus.
`use-canvas-mouse-actions.ts` already has an `isEditableTarget` guard — reuse
that helper rather than writing a second one.

While a modal dialog (help, settings, keyboard shortcuts, a delete
confirmation, the command menu) has focus, none of the
editor shortcuts above fire. The dialog owns the keyboard: `Delete` while
reading a node's help must not delete the node, and `Esc` closes the dialog
without also clearing the selection behind it.

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
- A wire in progress **may land on another wire** as well as on a pin: the
  click taps the wire it hit and the two join there. Only `from` may hold an
  anchor (ADR 0011), so such a wire is stored the other way round to the way it
  was drawn — the tap is `from`, the pin it started on is `to`, and the bends
  are reversed with the ends, exactly as they are when two pins are swapped to
  put the driver first. Landing on a wire is one undo step, tap included,
  because the tap has no meaning without the wire that reads it. Two landings
  are refused, and the hover handle is not offered for either: a wire that
  already *starts* on a tap has no second end to anchor, and a wire that
  already ends on the pin being drawn from is the same connection twice.
- A branch **starts on the wire it came from**: its `from` is a tap naming that
  wire and one of its bends, not a pin ([ADR 0011](decisions/0011-branches-are-wire-anchors.md)). The bend is an
  ordinary waypoint, so dragging it moves the branch's start with it — there is
  one point, and the wire that owns it is the one the handle belongs to. The
  branch is on the same net because the netlist resolves the tap through to that
  wire's own end, not because anything was copied.
- A branch leaves its tap **flat**: the one-cell stub exists to clear a node
  body, and there is no body here. A junction dot is drawn where it leaves, so
  three wires meeting reads the way a schematic does.
- The bend a branch starts from **cannot be dropped** — dragging it onto its
  neighbour, which straightens any other wire, leaves this one alone, because
  removing it would leave the branch starting nowhere. Delete the branch first.
- Deleting a wire deletes the branches hanging off it, and theirs in turn. A tap
  on a wire that is gone has no position at all, so there is nothing to leave
  behind for the user to reattach.

## Onboarding (built)

First run on a screen the editor is written for (`min-width: 768px` and
`hover: hover` — the complement of the device warning's own queries, so the two
never claim the screen together) opens the welcome dialog
([onboarding/](../src/components/onboarding/)). Both it and the tour are
replayable from the canvas header menu, and what has been seen is remembered in
`editor-settings.ts` as `welcomeSeen` / `tourSeen`.

| Surface | Behaviour |
| --- | --- |
| Welcome dialog | Five pages on a sliding track with a dot indicator. `←` / `→` move, the dots jump, **Skip** / Esc / a press outside end it. The demonstrations are live `CircuitPreview`s of shipped examples, mounted only while their page is the one on screen; the others draw the same circuit as a still |
| Guided tour | Six steps, each dimming the app and cutting one piece of chrome out of the dim. `←` / `→` move, Esc or a press outside ends it, and every other unmodified key is swallowed so the editor's single-key shortcuts do not fire behind the dim |
| Tour targets | Found by `data-tour`, looked up *inside the app shell* — a `CircuitPreview` renders the same canvas, toolbar and minimap into a portal and must not be mistaken for the editor's. A step whose target is not on screen is dropped when the tour opens, so the step count matches what the user can see |

## Feedback

- Wire colour encodes the resolved value: `0` dim, `1` bright/accent, `X` red,
  `Z` grey-dashed. Multi-bit buses draw thicker and write their value on the wire; the **Bus values** preference (Settings → Preferences → Canvas) hides it, leaving only an `X` marker.
  Stroke widths are in screen pixels (`vector-effect: non-scaling-stroke`), so a
  wire is the same weight at every zoom. The value label sits at the middle of
  the wire's *longest* segment, which on a diagonal route is the only place it
  is reliably clear of both nodes.
- A pin's shape says which way it points, since its colour is already the
  signal value: a pin that drives (`out`, `inout`) is a circle, a pin that only
  listens (`in`) is a square with rounded corners.
- Each pin is named on the element it belongs to, just *inside* the body on the
  edge the pin ended up on after rotation — the outside is where its wire
  leaves, and a label there would sit under every route into the node. The text
  stays upright at every angle, and sits on a chip in the node's own background
  colour, so it stays readable over a waveform, a seven-segment digit or the
  body title. The names come from `pins()`, so a node that renames or
  re-derives a pin relabels itself. They are decoration for the sighted reader
  only (`aria-hidden`): the pin button already carries the same name in its
  `aria-label` and tooltip.
- Whether they are drawn by default depends on the element, not on a list of
  types: a **basic** element (`NodeDefinition.kind`) has one pin to a side or a
  row of interchangeable inputs, so its shape already says which pin is which
  and the names are off; a **compound** one has several pins to an edge that
  nothing but their names distinguishes, so they are on. Both have their own
  switch under **Pin labels** in the settings dialog. These are editor
  preferences and are not part of a circuit.
- The sources and sinks — a switch, an LED, a probe, a keypad — **float** their
  names instead (`NodeDefinition.pinLabels`): the label hangs just *outside* the
  body, and only while the element is under the cursor or selected. Those bodies
  are four or five cells across and are themselves the thing being read, so an
  inline name would cover the lamp or the switch face it belongs to. Hovering is
  hit-tested against the scene, like every other pick, so the labels that appear
  are the ones on the element a click would select; selecting reveals the same
  labels, which is the keyboard path to them. Neither **Pin labels** switch
  applies to them — an element that shows its names only on approach has nothing
  for those switches to turn off.
- The body's title gives up the width the labels on its left and right edges
  occupy, and wraps to two lines rather than running underneath them. The
  element's own name — `node.label`, if it has one — hangs *outside* the body,
  below it unless the inspector's position pad (the button beside the label
  field: top, left, centre, right, bottom) says otherwise, so a renamed element
  does not fight its own pins for the same row. It sits on an opaque chip above
  everything else in the world layer, wires and neighbouring nodes included.
  **Centre** is the one placement inside the body: a block writes the label in
  place of the element's name, and a view with no name gets the chip across
  its face.
- Never rely on colour alone: `X` gets a `!` on the wire and a badge on the
  node, a floating net gets `~`, and every diagnostic is a row in the
  diagnostics panel that selects the element it is about when clicked.
- Every action reachable by keyboard is also reachable by menu or toolbar.
- Node bodies are focusable and expose `role`/`aria-label`; the canvas itself is
  `role="application"` (already set).

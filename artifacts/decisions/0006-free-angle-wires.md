# 0006. Wires run at any angle, and a wire is drawn click by click

Status: Accepted
Date: 2026-09-08

## Context

Wires were Manhattan: `wire-path.ts` ran every path through an `orthogonalize`
pass that inserted a corner whenever two consecutive points shared neither
axis, and auto-routing inserted a midpoint dogleg between two pins that were
merely offset. Two things came out of that.

The **geometry was not the user's**. A waypoint was a hint, not a bend: the
router put a corner wherever it liked on the way to it, and a wire could not be
drawn along the line the user actually wanted. Two pins one grid cell apart in
y got a three-segment staircase where a straight line would do, and on a dense
board those staircases stack into ambiguous parallel runs that are hard to
trace by eye.

The **drawing gesture was a drag**. Press on a pin, hold, release on the other
pin. That is fine for two adjacent gates and bad for anything longer: the route
across a board needs bends, and there was no way to place one without drawing
the wire first, releasing it into the `unresolved` state, then dragging its
segments into shape afterwards.

Both are built gestures, so this record exists rather than a quiet change.

## Decision

**A wire segment may run in any direction**, horizontal, vertical or diagonal.
`wirePath` is now exactly: pin, a one-cell stub perpendicular to the pin's edge
so the wire clears the node body, every waypoint in order, the far stub, pin.
`orthogonalize` is gone, and there is no auto-inserted bend at all — a wire
with no waypoints is one straight line between its two stubs.

**Waypoints are placed by clicking.** A click on a pin arms a wire; it then
follows the cursor. Each click on empty canvas drops a bend at that point,
snapped to the grid. A click on a second pin connects, and the bends are stored
with the wire in the same command, so the whole thing is one undo step. Esc
cancels. Drag-from-pin-to-pin still connects in one gesture, because release
over a pin completes a wire — release anywhere else simply leaves it armed.

**Corners are rounded when drawn**, not when routed. `smoothPath` turns the
polyline into an SVG `d` by replacing each bend with a quadratic tangent to
both arms, radius shrinking to fit short segments. The polyline stays the
geometry of record: hit-testing, selection and waypoint storage all use it, so
the curve can never disagree with what is clickable.

## Consequences

- Dropping a wire on empty canvas no longer marks it `unresolved` — it stays
  live and following the cursor. `unresolved` now means only "that connection
  was refused", which is the one case where red is the right answer.
- Rubber-band selection needed a real segment/box clip (Liang–Barsky in
  `hit-test.ts`); the old interval-overlap test was only correct for
  axis-aligned segments and would catch a diagonal it passes nowhere near.
- `moveSegment` drags in both axes now. A segment no longer has "its one free
  axis", so bending is freer and slightly less predictable — a drag that used
  to slide along a rail now goes where the pointer goes.
- Saved documents are unaffected: `waypoints` were already absolute world
  points, and a Manhattan wire's stored bends replay as a Manhattan wire.
  Nothing needs a migration.
- We lose the tidiness a Manhattan-only board has by construction. Diagonals
  read well when they are the user's choice and badly when they are an
  accident, and there is nothing here that stops the second. Should that bite,
  the answer is an opt-in orthogonal snap while drawing, not a return to
  rewriting the user's geometry after the fact.
- Still no obstacle avoidance, and now a straight diagonal is more likely to
  cross a node than a staircase was. The fix stays the same: bend it.

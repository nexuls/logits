# 0007. A wire is bent by its waypoints, not by its segments

Status: Accepted
Date: 2026-09-08

Refines [0006](0006-free-angle-wires.md), which freed the geometry but left
segment dragging as the way to bend a wire.

## Context

After ADR 0006 a wire was still bent by grabbing a *segment* and dragging it.
Three things were wrong with that.

**Every part of a wire was draggable, whether or not anything was selected.** A
press anywhere along a wire moved it. There was no way to click a wire to look
at it without also being one twitch away from reshaping it, and nothing on
screen distinguished "this wire is selected" from "this wire is about to move".

**The thing being dragged was not the thing being stored.** `moveSegment`
worked on the rendered polyline — stubs, pin endpoints and all — and the result
was converted back into waypoints with `waypointsFromPath`, which sliced the
endpoints off and re-simplified. A bend therefore made a round trip through a
representation it did not come from on every pointer frame, and the two could
disagree: dragging an end segment had to *invent* a bend to avoid pulling the
wire off its pin, and collinear points were folded away underneath the user.

**A free-angle segment has no obvious grab point.** Under Manhattan routing a
segment slid along its one free axis, which made "drag the segment" legible.
Once a segment can run at any angle, dragging the whole segment moves two ends
at once in two dimensions, and where it ends up is hard to predict.

## Decision

**Waypoints are the handle, and the document is the model.** Selecting a wire
draws a filled dot on each of its waypoints; those dots are what can be
dragged, and dragging one edits `Wire.waypoints[index]` directly through
`moveWireWaypoint`. Nothing round-trips through the polyline any more —
`moveSegment` and `waypointsFromPath` are gone.

**A press on the wire body offers a new bend.** Hovering a wire draws a hollow
dot at the point of the wire nearest the cursor — not at the segment's
midpoint, so it is where the user is actually pointing. A click there only
selects the wire; a *drag* inserts a waypoint at that point and drags it, as
one undo step. The preview and the inserted bend are the same point, computed
once by `wireAt`, so the offer cannot lie about where the bend will go.

**The router reports where a bend belongs.** `wirePath` returns `slots`
alongside `points`: per segment, the index a bend dropped on it takes in the
document's list. Waypoints are also pinned through simplification — a waypoint
that happens to fall on a straight run stays a vertex — so a handle is always
on the wire, and `slots` can never drift out of step with `Wire.waypoints`.

**Dropping a bend on its neighbour removes it**, which is how a wire is
straightened again. It is the one way to delete a waypoint short of deleting
the wire.

## Consequences

- Bending is a two-step gesture now: select the wire, then drag a handle. That
  is one more click than before for a wire you have not touched yet, bought
  with a wire you cannot reshape by accident.
- Handles are only hit-testable while their wire is selected. `waypointAt`
  takes the selected ids rather than scanning the scene, so a handle nobody can
  see can never be grabbed.
- Hovering now runs the pin, waypoint, node and wire hit-tests on every pointer
  move over the canvas, where an idle pointer used to cost nothing. It is
  bounded by scene size and lands in the same place as the spatial-index work
  already on the roadmap.
- Waypoints render at a fixed size in *world* units, so they scale with the
  circuit like the pin dots and node bodies do rather than staying constant on
  screen. Zoomed far out they are small; that is consistent with everything
  else on the canvas.
- Supersedes the `moveSegment` consequence in ADR 0006.

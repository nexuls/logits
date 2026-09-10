# 0011. A branch is a wire anchored to another wire's bend

Status: Accepted
Date: 2026-09-10

Refines [0007](0007-waypoint-handles.md), whose waypoint indices this makes
load-bearing for a second reason.

## Context

Tapping a wire to run a third connection off it is the one thing every
schematic editor does that this model had no room for. `Wire.from` and
`Wire.to` were both `PinRef`, so a wire could only ever start on a pin, and
there was no way to say "start here, on that wire, at that point".

Two designs were built. The first shipped and was replaced.

**A junction node** (`bus.junction`, since deleted). Right-click split the
tapped wire in two and placed a one-pin `inout` node between the halves; the
branch was an ordinary wire from that node's pin. It needed no model change at
all — the net formed through the shared pin, and `buildNetlist` never learned
anything new. But the tap became a *component*: it sat in the node count, in
the palette, in the netlist and in the save file, it drew with the node
renderer's border and background, and it was the wrong size for a point on a
wire because the smallest thing the renderer draws is a 2×2-cell body. Worse,
the wire the user drew was silently replaced by two wires, so selecting "the
wire" afterwards selected half of it.

**An anchored endpoint**, which is this decision.

## Decision

`Wire.from` is `PinRef | WireAnchor`, where `WireAnchor` is `{ wireId,
waypoint }`. Branching inserts an ordinary waypoint into the tapped wire at the
point clicked and gives the new wire an anchor naming it.

Only `from` may be an anchor: a wire is always landed on a pin, so `to` stays a
`PinRef` and every reader of it is unchanged.

`buildNetlist` resolves an anchor by walking to the tapped wire's own `from`,
repeatedly, until it reaches a pin. A wire's two ends are one net by
construction, so joining to either end joins to the net.

## Consequences

**The tap is not a thing.** There is one point — a bend on the tapped wire —
and both wires read it. Dragging the handle moves the branch's start because
there is nothing else it could do; no position is stored on the branch and no
two copies can drift. The wire the user drew stays one wire.

**A wire drawn *into* a wire is stored back to front.** "Only `from` may be an
anchor" is a rule about the record, not about which way the user drew. Landing
a wire in progress on another wire stores the tap as `from` and the pin it
started on as `to`, reversing the bends with the ends — the same swap `connect`
already performed to put a driver in `from`, so nothing downstream learned a
second shape. The one case with nowhere to go is a wire that already *starts*
on a tap: it is refused rather than landed, since a second anchor has no end
left to occupy.

**Waypoint indices became load-bearing.** A waypoint is identified by its
position in the list (ADR 0007), so inserting or removing one shifts the
anchors after it. `insertWireWaypoint` and `removeWireWaypoint` re-index them
and are the only two functions that can shift an index, which is what keeps the
rule in one place. The alternative — giving waypoints stable ids — was rejected
as a larger change to the save format for a problem two functions can hold.

**Some edits now cascade.** Deleting a wire deletes the branches on it, and
theirs; copying a branch re-points it at the copy of the wire it tapped, and a
branch whose tapped wire was not copied is left behind. The bend a branch
starts from cannot be dropped, so the "drag a bend onto its neighbour to
straighten" gesture skips it rather than orphaning a wire.

**The save format moved to v3.** A v2 document is a valid v3 one — every v2
wire is pin-to-pin — so the migration is empty, but the version has to move so
a v3 file containing a branch does not open in a v2 build that would read the
anchored end as a malformed `PinRef` and drop the wire.

**A branch has no stub.** The one-cell stub exists to take a wire clear of a
node body, and there is no body at a tap, so `wirePath` takes `null` for the
side and starts flat. The junction dot the wire layer draws at each tap is what
makes three wires meeting read as a connection.

**It can still dangle.** A hand-written file can name a wire that is not there,
or a cycle. `deserialize` drops such a branch as a `dangling-wire`, and
`resolveWireEnd` returns null on a cycle rather than spinning.

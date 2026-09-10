"use client";

import {
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CanvasViewport } from "@/components/canvas/canvas-viewport";
import type { ConnectResult } from "@/lib/circuit/commands";
import { screenToWorldLength } from "@/lib/circuit/coords";
import {
  GRID_SIZE,
  placementCenters,
  type Rect,
  rotateSize,
  snapPointToGrid,
} from "@/lib/circuit/geometry";
import {
  isWireAnchor,
  type PinRef,
  type Point,
  type WireEnd,
} from "@/lib/circuit/schema";
import { pendingWirePath } from "@/lib/circuit/wire-path";
import type { NodeDefinition } from "@/lib/nodes/define";
import {
  addWireWaypoint,
  branchWire,
  connectPins,
  connectPinToWire,
  dragWireWaypoint,
  dropWireWaypoint,
  moveSelection,
  placeNodes,
} from "@/state/document";
import {
  elementsInRect,
  nodeAt,
  type PinHit,
  pinAt,
  pinsCompatible,
  rectBetween,
  WAYPOINT_HIT_RADIUS,
  WIRE_HIT_RADIUS,
  type WireHit,
  waypointAt,
  wireAt,
} from "@/state/hit-test";
import type { ResolvedPin, ResolvedWire, Scene } from "@/state/scene";
import {
  addToSelection,
  clearSelection,
  getSelection,
  selectOnly,
  toggleInSelection,
} from "@/state/selection";

/**
 * Pointer gestures on the canvas: placing, selecting, moving, wiring, bending.
 *
 * Everything here is bookkeeping over the pure functions elsewhere — picking
 * comes from `hit-test.ts`, routing from `wire-path.ts`, and every document
 * change goes through a command in the document store (Non-negotiable #9). The
 * hook owns only "which gesture is in progress", which is the one thing that
 * genuinely cannot be derived.
 *
 * Screen and world coordinates never mix: pointer positions are converted once
 * at the top of each handler through the canvas viewport, and every tolerance
 * is a screen length converted into world units so hit targets stay the same
 * physical size at every zoom (Non-negotiable #7).
 */

/** Screen pixels a pointer may wander before a click counts as a drag. */
const DRAG_THRESHOLD_PX = 3;

/** Screen pixels a pin snaps within while wiring, per the interaction spec. */
const PIN_SNAP_PX = 14;

type Gesture =
  | { kind: "none" }
  /** Pressed on a node, but not yet past the drag threshold. */
  | {
      kind: "press-node";
      nodeId: string;
      startWorld: Point;
      startClient: Point;
      snap: boolean;
    }
  | {
      kind: "move-nodes";
      nodeIds: readonly string[];
      startWorld: Point;
      /** World delta already committed, so each move applies only the change. */
      applied: Point;
      snap: boolean;
    }
  | {
      kind: "band";
      originWorld: Point;
      currentWorld: Point;
      additive: boolean;
    }
  /**
   * Pressed on a wire, but not yet past the drag threshold — a click here
   * selects the wire, and only a drag turns into a new bend.
   */
  | {
      kind: "press-wire";
      wireId: string;
      /** Where in `Wire.waypoints` the new bend would go. */
      slot: number;
      /** The point on the wire under the press, which is where it lands. */
      origin: Point;
      startClient: Point;
    }
  | {
      kind: "drag-waypoint";
      wireId: string;
      /** Index into `Wire.waypoints`. */
      index: number;
      /** Where the bend sat when the drag began. */
      origin: Point;
      startWorld: Point;
    };

/**
 * Wiring is not in `Gesture` because it outlives the pointer: a wire is armed
 * by a click, follows the cursor across as many clicks as it takes to place its
 * bends, and ends only on a pin or on Esc (artifacts/07-interaction-spec.md).
 */
type Wiring = {
  from: WireEnd;
  /**
   * Where the pointer was when the wire was armed, or null when the keyboard
   * armed it. A release that has not travelled from there is the tail of the
   * click that started the wire, not a drop on whatever lies under the cursor.
   */
  armedClient: Point | null;
  /**
   * Where the wire is being drawn *from*: a pin's position and the edge it
   * leaves by, or — when the wire was branched off another — the tapped bend
   * and no side, since there is no body to stub out of. `spec` is null for a
   * branch too: a tap is a net rather than a pin, so every pin is a legal
   * target for it.
   */
  origin: {
    world: Point;
    side: ResolvedPin["side"] | null;
    spec: ResolvedPin["spec"] | null;
  };
  cursorWorld: Point;
  /** Bends dropped by clicking empty canvas, in world coordinates. */
  waypoints: readonly Point[];
  /** Set when a connection was refused, so the preview says so in red. */
  unresolved: boolean;
};

export type PendingWire = { points: Point[]; unresolved: boolean };

/**
 * A point on a wire that does not exist yet, shown under the cursor: the bend
 * a press would add, or — while a wire is being drawn — the tap it would land
 * on. One shape for both, because it is one point in both readings.
 */
export type WaypointPreview = {
  wireId: string;
  /** Where in that wire's `waypoints` the point would go. */
  slot: number;
  point: Point;
};

type Options = {
  scene: Scene;
  /** The canvas transform, as the canvas publishes it. */
  viewport: CanvasViewport;
  /** Node type armed by the palette, placed on the next canvas click. */
  armedDefinition: NodeDefinition | null;
  /** How many copies of it that click drops. Ignored when nothing is armed. */
  armedCount: number;
  onPlaced: () => void;
  /** Reports a refused connection so the editor can say why. */
  onNotice: (message: string) => void;
};

export function useEditorGestures({
  scene,
  viewport,
  armedDefinition,
  armedCount,
  onPlaced,
  onNotice,
}: Options) {
  const [gesture, setGesture] = useState<Gesture>({ kind: "none" });
  const [wiring, setWiring] = useState<Wiring | null>(null);
  /**
   * Where the ghost preview sits, or null while the pointer is off the canvas.
   * Kept as state only because the ghost is rendered from it; it is written
   * exclusively while something is armed, so an ordinary drag still does not
   * re-render the editor per pointer move.
   */
  const [ghostWorld, setGhostWorld] = useState<Point | null>(null);
  /**
   * The bend a press on the wire under the cursor would add, drawn as a hollow
   * handle so the wire says where it can be grabbed before it is grabbed.
   * Null whenever the cursor is not over a wire.
   */
  const [waypointPreview, setWaypointPreview] =
    useState<WaypointPreview | null>(null);
  /**
   * The node under the cursor, or null. Hit-tested against the scene rather
   * than read off a DOM `:hover`, because a node body takes no pointer events
   * — picking is mathematical, so hovering has to be too, or the two would
   * disagree about which of two overlapping nodes is on top.
   *
   * Only the id: it is compared against on every pointer move, and holding the
   * `ResolvedNode` would make an unmoved cursor look like a change on every
   * document edit.
   */
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // The scene changes on every document edit, and the handlers below are
  // installed on the viewport once; a ref keeps them reading the current one
  // without re-binding a listener per frame of a drag.
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const toWorld = useCallback(
    (event: { clientX: number; clientY: number }) =>
      viewport.toWorld({ x: event.clientX, y: event.clientY }),
    [viewport],
  );

  const worldLength = useCallback(
    (screenPx: number) => screenToWorldLength(screenPx, viewport),
    [viewport],
  );

  /** Arms a wire from a pin or from a tap on another wire. */
  const beginWiring = useCallback(
    (
      from: WireEnd,
      origin: Wiring["origin"],
      armedClient: Point | null = null,
    ) => {
      setWiring({
        from,
        armedClient,
        origin,
        cursorWorld: origin.world,
        waypoints: [],
        unresolved: false,
      });
    },
    [],
  );

  const startWiring = useCallback(
    (hit: PinHit, armedClient: Point | null = null) => {
      beginWiring(
        { nodeId: hit.node.node.id, pinId: hit.pin.spec.id },
        { world: hit.pin.world, side: hit.pin.side, spec: hit.pin.spec },
        armedClient,
      );
    },
    [beginWiring],
  );

  /** A click on empty canvas while wiring: drop a bend and keep drawing. */
  const addWaypoint = useCallback((world: Point) => {
    setWiring((current) =>
      current
        ? {
            ...current,
            waypoints: [...current.waypoints, snapPointToGrid(world)],
            // The bend is the user answering the refusal, so drop the warning.
            unresolved: false,
          }
        : current,
    );
  }, []);

  /**
   * Clears the wire in progress, or keeps it and explains the refusal — the
   * one place either happens, whatever the wire was landing on.
   *
   * The refusal cases are the ones the connect commands reject structurally; a
   * merely *wrong* circuit — mismatched widths, two drivers — is allowed
   * through and reported by the netlist instead, which is the rule commands
   * work by.
   */
  const settleWiring = useCallback(
    (result: ConnectResult, current: Wiring) => {
      if (result.ok) {
        setWiring(null);
        return;
      }

      setWiring({ ...current, unresolved: true });
      onNotice(
        {
          "missing-pin": "That pin no longer exists.",
          "same-pin": "A wire needs two different pins.",
          "same-node": "Wire between two nodes, not a node and itself.",
          "already-connected": "Those pins are already wired together.",
          "branch-needs-pin": "A branch has to land on a pin.",
        }[result.reason],
      );
    },
    [onNotice],
  );

  /** Completes the wire onto a pin, or explains why it cannot. */
  const finishWiring = useCallback(
    (hit: PinHit) => {
      if (!wiring) return;

      const to: PinRef = { nodeId: hit.node.node.id, pinId: hit.pin.spec.id };
      settleWiring(connectPins(wiring.from, to, wiring.waypoints), wiring);
    },
    [settleWiring, wiring],
  );

  /**
   * Lands the wire in progress on another wire, tapping it where it was hit.
   *
   * The stored wire runs the other way round — the tap is `from` and the pin
   * the user started on is `to`, because only `from` may be an anchor (ADR
   * 0011) — but the gesture does not: the user drew away from a pin and landed
   * on a wire, and `connectPinToWire` reverses the bends to match.
   */
  const finishWiringOnWire = useCallback(
    (hit: WireHit) => {
      if (!wiring) return;

      settleWiring(
        connectPinToWire(
          wiring.from,
          { wireId: hit.wire.wire.id, slot: slotFor(hit), point: hit.point },
          wiring.waypoints,
        ),
        wiring,
      );
    },
    [settleWiring, wiring],
  );

  const cancelWiring = useCallback(() => {
    setWiring(null);
  }, []);

  /** The keyboard path: Enter on a pin starts a wire, Enter again finishes it. */
  const activatePin = useCallback(
    (nodeId: string, pinId: string) => {
      const node = sceneRef.current.nodes[nodeId];
      const pin = node?.pinsById[pinId];
      if (!node || !pin) return;

      if (wiring) finishWiring({ node, pin });
      else startWiring({ node, pin });
    },
    [finishWiring, startWiring, wiring],
  );

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const world = toWorld(event);
      const current = sceneRef.current;

      // A right-click owns only a wire: it taps the wire under the cursor and
      // arms a wire from the junction that lands there, which from here on is
      // an ordinary wire in progress from an ordinary pin. Anywhere else, or
      // mid-gesture already, it does nothing — the canvas suppresses the
      // browser's own menu either way.
      if (event.button === 2) {
        if (armedDefinition || wiring || gesture.kind !== "none") return;

        const wire = wireAt(current, world, worldLength(WIRE_HIT_RADIUS));
        if (!wire) return;

        event.preventDefault();
        const branch = branchWire(wire.wire.wire.id, slotFor(wire), wire.point);
        if (branch) {
          beginWiring(
            branch.anchor,
            { world: branch.world, side: null, spec: null },
            { x: event.clientX, y: event.clientY },
          );
        }
        return;
      }

      if (event.button !== 0) return;

      // Placing wins over everything else: the palette armed a type and the
      // click is the user saying where.
      if (armedDefinition) {
        event.preventDefault();
        const nodeIds = placeNodes(
          armedDefinition,
          batchCenters(armedDefinition, world, armedCount),
        );
        if (nodeIds.length > 0) selectOnly(nodeIds);
        onPlaced();
        return;
      }

      const pin = pinAt(current, world, worldLength(PIN_SNAP_PX));

      // A wire in progress owns the click: on a pin it lands, on another wire
      // it taps it and lands there, and anywhere else it drops a bend and keeps
      // following the cursor. Alt forces the bend, which is the way to route
      // through a wire the user did not mean to join. Esc is the way out.
      if (wiring) {
        event.preventDefault();
        if (pin) {
          finishWiring(pin);
          return;
        }

        const tap = event.altKey
          ? null
          : tapTarget(current, wiring, world, worldLength(WIRE_HIT_RADIUS));
        if (tap) finishWiringOnWire(tap);
        else addWaypoint(world);
        return;
      }

      if (pin) {
        event.preventDefault();
        startWiring(pin, { x: event.clientX, y: event.clientY });
        return;
      }

      // A handle on a selected wire outranks the node it may be sitting over:
      // it is small, deliberate, and only drawn where the user can see it.
      const handle = waypointAt(
        current,
        world,
        getSelection().wireIds,
        worldLength(WAYPOINT_HIT_RADIUS),
      );
      if (handle) {
        event.preventDefault();
        setGesture({
          kind: "drag-waypoint",
          wireId: handle.wire.wire.id,
          index: handle.index,
          origin: (handle.wire.wire.waypoints ?? [])[handle.index],
          startWorld: world,
        });
        return;
      }

      const node = nodeAt(current, world);
      if (node) {
        event.preventDefault();
        const additive = event.shiftKey || event.ctrlKey || event.metaKey;
        const id = node.node.id;

        if (additive) {
          toggleInSelection("node", id);
        } else if (!getSelection().nodeIds.includes(id)) {
          selectOnly([id]);
        }

        setGesture({
          kind: "press-node",
          nodeId: id,
          startWorld: world,
          startClient: { x: event.clientX, y: event.clientY },
          // Alt bypasses the grid, which is the only way to nudge a node off it.
          snap: !event.altKey,
        });
        return;
      }

      const wire = wireAt(current, world, worldLength(WIRE_HIT_RADIUS));
      if (wire) {
        event.preventDefault();
        const id = wire.wire.wire.id;

        if (event.shiftKey || event.ctrlKey || event.metaKey) {
          toggleInSelection("wire", id);
        } else {
          selectOnly([], [id]);
        }

        // Not a bend yet: a click on a wire only selects it. The bend appears
        // if the press turns into a drag, at the point that was pressed.
        setGesture({
          kind: "press-wire",
          wireId: id,
          slot: slotFor(wire),
          origin: wire.point,
          startClient: { x: event.clientX, y: event.clientY },
        });
        return;
      }

      // Empty canvas: rubber band. Shift keeps what is already selected, so a
      // second sweep adds to the first.
      event.preventDefault();
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      if (!additive) clearSelection();

      setGesture({
        kind: "band",
        originWorld: world,
        currentWorld: world,
        additive,
      });
    },
    [
      addWaypoint,
      armedCount,
      armedDefinition,
      beginWiring,
      finishWiring,
      finishWiringOnWire,
      gesture.kind,
      onPlaced,
      startWiring,
      toWorld,
      wiring,
      worldLength,
    ],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const world = toWorld(event);
      const current = sceneRef.current;

      if (armedDefinition) setGhostWorld(world);

      if (wiring) {
        setWiring((wire) => (wire ? { ...wire, cursorWorld: world } : wire));
      }

      // Which node the cursor is over, tracked while the pointer is not busy
      // dragging something. Wiring is deliberately included: a floating pin
      // label is most wanted exactly while a wire is looking for its landing.
      const overNode =
        gesture.kind === "none" && !armedDefinition
          ? nodeAt(current, world)
          : null;
      const overNodeId = overNode?.node.id ?? null;
      // Compared before it is stored, like the preview below: the cursor
      // crosses a node once and moves within it for hundreds of events.
      setHoveredNodeId((shown) => (shown === overNodeId ? shown : overNodeId));

      // The preview is a hover affordance, so it is offered only when the
      // pointer is free: not mid-gesture and not placing. While a wire is being
      // drawn the same handle marks the tap it would land on instead of the
      // bend a press would add — one point either way.
      if (gesture.kind === "none" && !armedDefinition) {
        // A pin, a node body, or a handle already there wins — offering a
        // point would promise a gesture the click is not going to perform.
        // Handles are not in the way while wiring: they cannot be grabbed then.
        const blocked =
          overNode !== null ||
          pinAt(current, world, worldLength(PIN_SNAP_PX)) !== null ||
          (!wiring &&
            waypointAt(
              current,
              world,
              getSelection().wireIds,
              worldLength(WAYPOINT_HIT_RADIUS),
            ) !== null);
        const radius = worldLength(WIRE_HIT_RADIUS);
        const hovered = blocked
          ? null
          : wiring
            ? tapTarget(current, wiring, world, radius)
            : wireAt(current, world, radius);

        // Compared rather than replaced: the pointer moves far more often than
        // the handle moves a pixel, and an unchanged preview must not re-render
        // the wire layer.
        setWaypointPreview((shown) =>
          samePreview(shown, hovered)
            ? shown
            : hovered && {
                wireId: hovered.wire.wire.id,
                slot: slotFor(hovered),
                point: hovered.point,
              },
        );
      } else if (waypointPreview) {
        setWaypointPreview(null);
      }

      switch (gesture.kind) {
        case "press-node": {
          const travelled = Math.hypot(
            event.clientX - gesture.startClient.x,
            event.clientY - gesture.startClient.y,
          );
          if (travelled < DRAG_THRESHOLD_PX) return;

          // Promoted only once the pointer has actually travelled, so a click
          // that wobbles by a pixel does not land in the undo stack as a move.
          setGesture({
            kind: "move-nodes",
            nodeIds: getSelection().nodeIds,
            startWorld: gesture.startWorld,
            applied: { x: 0, y: 0 },
            snap: gesture.snap,
          });
          return;
        }

        case "move-nodes": {
          const total = {
            x: world.x - gesture.startWorld.x,
            y: world.y - gesture.startWorld.y,
          };
          // Snapped against the gesture's *start*, not the last frame: snapping
          // each small step would round most of them to zero and the node would
          // never move at all.
          const target = gesture.snap ? snapPointToGrid(total) : total;
          const delta = {
            x: target.x - gesture.applied.x,
            y: target.y - gesture.applied.y,
          };
          if (delta.x === 0 && delta.y === 0) return;

          moveSelection(gesture.nodeIds, delta, {
            snap: false,
            coalesce: true,
          });
          setGesture({ ...gesture, applied: target });
          return;
        }

        case "band":
          setGesture({ ...gesture, currentWorld: world });
          return;

        case "press-wire": {
          const travelled = Math.hypot(
            event.clientX - gesture.startClient.x,
            event.clientY - gesture.startClient.y,
          );
          if (travelled < DRAG_THRESHOLD_PX) return;

          // The bend goes in where the press was, not where the pointer has
          // got to, so the wire does not jump out from under the cursor.
          addWireWaypoint(gesture.wireId, gesture.slot, gesture.origin);
          setGesture({
            kind: "drag-waypoint",
            wireId: gesture.wireId,
            index: gesture.slot,
            origin: snapPointToGrid(gesture.origin),
            startWorld: gesture.origin,
          });
          return;
        }

        case "drag-waypoint": {
          dragWireWaypoint(gesture.wireId, gesture.index, {
            x: gesture.origin.x + (world.x - gesture.startWorld.x),
            y: gesture.origin.y + (world.y - gesture.startWorld.y),
          });
          return;
        }

        default:
          return;
      }
    },
    [armedDefinition, gesture, toWorld, waypointPreview, wiring, worldLength],
  );

  /** The pointer left the canvas, so the ghost and the hover handle go with it. */
  const onPointerLeave = useCallback(() => {
    setGhostWorld(null);
    setWaypointPreview(null);
    setHoveredNodeId(null);
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const world = toWorld(event);
      const current = sceneRef.current;

      // Release only ever *completes* a wire, so drag-from-pin-to-pin still
      // works in one gesture. Releasing anywhere else leaves the wire armed and
      // following the cursor — the click-click-click path — rather than
      // discarding what the user drew.
      if (wiring) {
        const hit = pinAt(current, world, worldLength(PIN_SNAP_PX));
        // A branch has no pin to have started on, so nothing can be "the same
        // pin" as its start and every hit is a real landing.
        const sameAsStart =
          hit &&
          !isWireAnchor(wiring.from) &&
          hit.node.node.id === wiring.from.nodeId &&
          hit.pin.spec.id === wiring.from.pinId;

        if (hit && !sameAsStart) {
          finishWiring(hit);
        } else if (!hit && !event.altKey && travelledFrom(wiring, event)) {
          // Only after the pointer has actually travelled: the release that
          // arms a wire from a pin happens on top of the wires already meeting
          // that pin, and must not land on one of them.
          const tap = tapTarget(
            current,
            wiring,
            world,
            worldLength(WIRE_HIT_RADIUS),
          );
          if (tap) finishWiringOnWire(tap);
        }
      }

      // Dropped on top of the vertex next door: the bend is doing nothing, so
      // it goes, and the wire straightens through where it used to be. This is
      // the only way to remove a bend without deleting the wire.
      if (gesture.kind === "drag-waypoint") {
        const wire = current.wires[gesture.wireId];
        if (wire && isRedundantWaypoint(wire, gesture.index)) {
          dropWireWaypoint(gesture.wireId, gesture.index);
        }
      }

      if (gesture.kind === "band") {
        const rect = rectBetween(gesture.originWorld, gesture.currentWorld);
        const found = elementsInRect(current, rect);

        if (gesture.additive) addToSelection(found.nodeIds, found.wireIds);
        else selectOnly(found.nodeIds, found.wireIds);
      }

      if (gesture.kind !== "none") setGesture({ kind: "none" });
    },
    [finishWiring, finishWiringOnWire, gesture, toWorld, wiring, worldLength],
  );

  /**
   * Where a bend would go if the wire under the cursor were pressed right now.
   * Suppressed while a bend is actually being dragged, so the preview does not
   * trail the handle the user is already holding.
   */
  const waypointGhost = gesture.kind === "none" ? waypointPreview : null;

  /** The rubber band in world coordinates, or null when none is being drawn. */
  const band: Rect | null =
    gesture.kind === "band"
      ? rectBetween(gesture.originWorld, gesture.currentWorld)
      : null;

  /**
   * The in-progress wire, routed the same way a real one is — through
   * `wirePath` — so what the user sees while dragging is what they will get.
   */
  const pendingWire: PendingWire | null = wiring
    ? {
        points: pendingWirePath(
          wiring.origin.world,
          wiring.origin.side,
          // Snapped onto the tap it would land on, the same way it snaps to a
          // pin, so the preview shows the connection before the click makes it.
          waypointPreview?.point ?? wiring.cursorWorld,
          wiring.waypoints,
        ),
        unresolved: wiring.unresolved,
      }
    : null;

  /**
   * Pins the in-progress wire could legally land on, so the node layer can
   * highlight them. Empty when nothing is being wired.
   */
  const compatiblePinIds = useMemo(
    () => (wiring ? pinKeysCompatibleWith(scene, wiring) : EMPTY_KEYS),
    [scene, wiring],
  );

  /**
   * Where the armed batch would land, in world coordinates — the same centres
   * `placeNodes` will be given, so the preview cannot drift from the result.
   * Null when nothing is armed or the pointer is off the canvas.
   */
  const ghostCenters = useMemo(
    () =>
      armedDefinition && ghostWorld
        ? batchCenters(armedDefinition, ghostWorld, armedCount)
        : null,
    [armedCount, armedDefinition, ghostWorld],
  );

  return {
    band,
    ghostCenters,
    hoveredNodeId,
    pendingWire,
    waypointGhost,
    compatiblePinIds,
    isWiring: wiring !== null,
    activatePin,
    cancelWiring,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerLeave,
    /** What the viewport cursor should be while a gesture is armed. */
    cursor:
      armedDefinition || wiring
        ? "var(--logit-cursor-cross)"
        : gesture.kind === "move-nodes" || gesture.kind === "drag-waypoint"
          ? "var(--logit-cursor-move)"
          : undefined,
  };
}

/** Where in `Wire.waypoints` a bend dropped on this hit belongs. */
function slotFor(hit: WireHit): number {
  return hit.wire.slots[hit.index] ?? hit.wire.wire.waypoints?.length ?? 0;
}

/**
 * The wire the in-progress wire would tap at `world`, or null.
 *
 * A wire that already *starts* on a tap has nowhere to put a second one — only
 * `from` may be an anchor (ADR 0011) — and the wire that already ends on the
 * pin this one started from would be the same connection drawn twice. Both are
 * refused by `connectToWire`; they are checked here as well so the affordance
 * never offers a landing the click would then reject.
 */
function tapTarget(
  scene: Scene,
  wiring: Wiring,
  world: Point,
  radius: number,
): WireHit | null {
  if (isWireAnchor(wiring.from)) return null;

  const hit = wireAt(scene, world, radius);
  if (!hit) return null;

  const from = wiring.from;
  const ends = [hit.wire.wire.from, hit.wire.wire.to];
  const onOriginPin = ends.some(
    (end) =>
      !isWireAnchor(end) &&
      end.nodeId === from.nodeId &&
      end.pinId === from.pinId,
  );

  return onOriginPin ? null : hit;
}

/** Has the pointer left the point the wire was armed at? */
function travelledFrom(
  wiring: Wiring,
  event: { clientX: number; clientY: number },
): boolean {
  if (!wiring.armedClient) return false;
  return (
    Math.hypot(
      event.clientX - wiring.armedClient.x,
      event.clientY - wiring.armedClient.y,
    ) >= DRAG_THRESHOLD_PX
  );
}

/** Is this preview the one already on screen? Keeps hovering from re-rendering. */
function samePreview(
  shown: WaypointPreview | null,
  hit: WireHit | null,
): boolean {
  if (!shown || !hit) return shown === null && hit === null;
  return (
    shown.wireId === hit.wire.wire.id &&
    shown.slot === slotFor(hit) &&
    Math.abs(shown.point.x - hit.point.x) < 0.5 &&
    Math.abs(shown.point.y - hit.point.y) < 0.5
  );
}

/**
 * Has a bend been dragged onto the vertex next to it?
 *
 * Waypoints snap to the grid and so do the pins and stubs around them, so
 * "on top of" is exact up to a fraction of a cell — anything closer than half
 * a cell is the same point, and the bend is no longer bending anything.
 */
function isRedundantWaypoint(wire: ResolvedWire, index: number): boolean {
  const waypoint = (wire.wire.waypoints ?? [])[index];
  if (!waypoint) return false;

  const at = wire.points.findIndex(
    (point) => point.x === waypoint.x && point.y === waypoint.y,
  );
  if (at < 0) return false;

  const limit = GRID_SIZE / 2;
  return [wire.points[at - 1], wire.points[at + 1]].some(
    (neighbour) =>
      neighbour !== undefined &&
      Math.hypot(neighbour.x - waypoint.x, neighbour.y - waypoint.y) < limit,
  );
}

/** Centres for a palette batch dropped at `world`, rotation-aware. */
function batchCenters(
  definition: NodeDefinition,
  world: Point,
  count: number,
): Point[] {
  const size = rotateSize(definition.size(definition.defaultParams), 0);
  return placementCenters(world, size, Math.max(1, count));
}

const EMPTY_KEYS: ReadonlySet<string> = new Set();

function pinKeysCompatibleWith(scene: Scene, wiring: Wiring): Set<string> {
  const keys = new Set<string>();
  const origin = wiring.origin.spec;
  const skip = isWireAnchor(wiring.from) ? null : wiring.from.nodeId;

  for (const [nodeId, node] of Object.entries(scene.nodes)) {
    if (nodeId === skip) continue;
    for (const pin of node.pins) {
      // A branch starts on a net rather than a pin, so it has no direction to
      // clash with and anything is a legal target.
      if (!origin || pinsCompatible({ spec: origin }, pin)) {
        keys.add(`${nodeId}/${pin.spec.id}`);
      }
    }
  }

  return keys;
}

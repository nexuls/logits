"use client";

import {
  type PointerEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import type { CanvasViewport } from "@/components/canvas/canvas-viewport";
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

/** A bend that does not exist yet, shown under the cursor on a wire. */
export type WaypointPreview = { wireId: string; point: Point };

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
  const beginWiring = useCallback((from: WireEnd, origin: Wiring["origin"]) => {
    setWiring({
      from,
      origin,
      cursorWorld: origin.world,
      waypoints: [],
      unresolved: false,
    });
  }, []);

  const startWiring = useCallback(
    (hit: PinHit) => {
      beginWiring(
        { nodeId: hit.node.node.id, pinId: hit.pin.spec.id },
        { world: hit.pin.world, side: hit.pin.side, spec: hit.pin.spec },
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
   * Completes a wire onto `hit`, or explains why it cannot.
   *
   * The refusal cases are the ones `connect` rejects structurally; a merely
   * *wrong* circuit — mismatched widths, two drivers — is allowed through and
   * reported by the netlist instead, which is the rule commands work by.
   */
  const finishWiring = useCallback(
    (hit: PinHit) => {
      if (!wiring) return;

      const to: PinRef = { nodeId: hit.node.node.id, pinId: hit.pin.spec.id };
      const result = connectPins(wiring.from, to, wiring.waypoints);

      if (result.ok) {
        setWiring(null);
        return;
      }

      setWiring({ ...wiring, unresolved: true });
      onNotice(
        {
          "missing-pin": "That pin no longer exists.",
          "same-pin": "A wire needs two different pins.",
          "same-node": "Wire between two nodes, not a node and itself.",
          "already-connected": "Those pins are already wired together.",
        }[result.reason],
      );
    },
    [onNotice, wiring],
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
          beginWiring(branch.anchor, {
            world: branch.world,
            side: null,
            spec: null,
          });
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

      // A wire in progress owns the click: on a pin it lands, anywhere else it
      // drops a bend and keeps following the cursor. Esc is the way out.
      if (wiring) {
        event.preventDefault();
        if (pin) finishWiring(pin);
        else addWaypoint(world);
        return;
      }

      if (pin) {
        event.preventDefault();
        startWiring(pin);
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

      // The preview is a hover affordance, so it is offered only when the
      // pointer is free: not mid-gesture, not placing, not drawing a wire.
      if (gesture.kind === "none" && !armedDefinition && !wiring) {
        // A pin, a node body, or a handle already there wins — offering a new
        // bend would promise a gesture the press is not going to perform.
        const blocked =
          pinAt(current, world, worldLength(PIN_SNAP_PX)) !== null ||
          waypointAt(
            current,
            world,
            getSelection().wireIds,
            worldLength(WAYPOINT_HIT_RADIUS),
          ) !== null ||
          nodeAt(current, world) !== null;
        const hovered = blocked
          ? null
          : wireAt(current, world, worldLength(WIRE_HIT_RADIUS));

        // Compared rather than replaced: the pointer moves far more often than
        // the handle moves a pixel, and an unchanged preview must not re-render
        // the wire layer.
        setWaypointPreview((shown) =>
          samePreview(shown, hovered)
            ? shown
            : hovered && { wireId: hovered.wire.wire.id, point: hovered.point },
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

        if (hit && !sameAsStart) finishWiring(hit);
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
    [finishWiring, gesture, toWorld, wiring, worldLength],
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
          wiring.cursorWorld,
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

/** Is this preview the one already on screen? Keeps hovering from re-rendering. */
function samePreview(
  shown: WaypointPreview | null,
  hit: WireHit | null,
): boolean {
  if (!shown || !hit) return shown === null && hit === null;
  return (
    shown.wireId === hit.wire.wire.id &&
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

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
  placementCenters,
  type Rect,
  rotateSize,
  snapPointToGrid,
} from "@/lib/circuit/geometry";
import type { PinRef, Point } from "@/lib/circuit/schema";
import {
  moveSegment,
  waypointsFromPath,
  wirePath,
} from "@/lib/circuit/wire-path";
import type { NodeDefinition } from "@/lib/nodes/define";
import {
  connectPins,
  moveSelection,
  placeNodes,
  updateWireWaypoints,
} from "@/state/document";
import {
  elementsInRect,
  nodeAt,
  PIN_HIT_RADIUS,
  type PinHit,
  pinAt,
  pinsCompatible,
  rectBetween,
  WIRE_HIT_RADIUS,
  wireAt,
} from "@/state/hit-test";
import type { ResolvedPin, Scene } from "@/state/scene";
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
const PIN_SNAP_PX = 10;

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
  | {
      kind: "bend";
      wireId: string;
      index: number;
      startWorld: Point;
      points: readonly Point[];
    };

/**
 * Wiring is not in `Gesture` because it outlives the pointer: dropping on
 * empty canvas leaves the wire pending and visibly unresolved rather than
 * discarding what the user drew (artifacts/07-interaction-spec.md).
 */
type Wiring = {
  from: PinRef;
  fromPin: ResolvedPin;
  cursorWorld: Point;
  /** Set once the pointer has been released without landing on a pin. */
  unresolved: boolean;
};

export type PendingWire = { points: Point[]; unresolved: boolean };

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

  const startWiring = useCallback((hit: PinHit) => {
    setWiring({
      from: { nodeId: hit.node.node.id, pinId: hit.pin.spec.id },
      fromPin: hit.pin,
      cursorWorld: hit.pin.world,
      unresolved: false,
    });
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
      const result = connectPins(wiring.from, to);

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
      if (event.button !== 0) return;

      const world = toWorld(event);
      const current = sceneRef.current;

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

      if (wiring) {
        event.preventDefault();
        if (pin) finishWiring(pin);
        else cancelWiring();
        return;
      }

      if (pin) {
        event.preventDefault();
        startWiring(pin);
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

        setGesture({
          kind: "bend",
          wireId: id,
          index: wire.index,
          startWorld: world,
          points: wire.wire.points,
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
      armedCount,
      armedDefinition,
      cancelWiring,
      finishWiring,
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

      if (armedDefinition) setGhostWorld(world);

      if (wiring) {
        setWiring((current) =>
          current ? { ...current, cursorWorld: world } : current,
        );
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

        case "bend": {
          const moved = moveSegment(gesture.points, gesture.index, {
            x: world.x - gesture.startWorld.x,
            y: world.y - gesture.startWorld.y,
          });
          // `moveSegment` has already snapped, and the endpoints it keeps are
          // the pins', which the document must not store.
          updateWireWaypoints(gesture.wireId, waypointsFromPath(moved), {
            snap: false,
            coalesce: true,
          });
          return;
        }

        default:
          return;
      }
    },
    [armedDefinition, gesture, toWorld, wiring],
  );

  /** The pointer left the canvas, so the ghost goes with it. */
  const onPointerLeave = useCallback(() => {
    setGhostWorld(null);
  }, []);

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const world = toWorld(event);
      const current = sceneRef.current;

      if (wiring && !wiring.unresolved) {
        const hit = pinAt(current, world, worldLength(PIN_SNAP_PX));
        const sameAsStart =
          hit &&
          hit.node.node.id === wiring.from.nodeId &&
          hit.pin.spec.id === wiring.from.pinId;

        // Landing back on the pin it started from is the click that *arms* a
        // wire rather than a zero-length drag, so it leaves wiring in progress.
        if (hit && !sameAsStart) {
          finishWiring(hit);
        } else if (!hit && !samePoint(world, wiring.fromPin.world)) {
          // Dropped on nothing: keep it drawn and flagged rather than
          // discarding the user's work.
          setWiring({ ...wiring, unresolved: true });
          onNotice("Drop the wire on a pin, or press Esc to cancel.");
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
    [finishWiring, gesture, onNotice, toWorld, wiring, worldLength],
  );

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
        points: wirePath(
          wiring.fromPin.world,
          wiring.fromPin.side,
          wiring.cursorWorld,
          oppositeSide(wiring.fromPin.side),
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
        : gesture.kind === "move-nodes"
          ? "var(--logit-cursor-move)"
          : undefined,
  };
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

  for (const [nodeId, node] of Object.entries(scene.nodes)) {
    if (nodeId === wiring.from.nodeId) continue;
    for (const pin of node.pins) {
      if (pinsCompatible(wiring.fromPin, pin)) {
        keys.add(`${nodeId}/${pin.spec.id}`);
      }
    }
  }

  return keys;
}

/** Where a wire being dragged should appear to enter the cursor from. */
function oppositeSide(side: ResolvedPin["side"]): ResolvedPin["side"] {
  switch (side) {
    case "left":
      return "right";
    case "right":
      return "left";
    case "top":
      return "bottom";
    default:
      return "top";
  }
}

/** A press and release at the same spot — a click, not a drag. */
function samePoint(a: Point, b: Point): boolean {
  return (
    Math.abs(a.x - b.x) < PIN_HIT_RADIUS && Math.abs(a.y - b.y) < PIN_HIT_RADIUS
  );
}

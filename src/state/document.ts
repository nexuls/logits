"use client";

import { useMemo, useSyncExternalStore } from "react";
import { getExample } from "@/example";
import {
  type ExecutionContext,
  type ExecutionResult,
  executeSteps,
  type IndexedStep,
} from "@/lib/assistant/execute";
import {
  type AddNodeOptions,
  addNode,
  branchWireAt,
  type ConnectResult,
  connect,
  connectToWire,
  deleteElements,
  extractFragment,
  type Fragment,
  insertFragment,
  insertWireWaypoint,
  moveNodes,
  moveWireWaypoint,
  removeWireWaypoint,
  renameDocument,
  rotateNodes,
  type Selection,
  setDefaultZoom,
  setLinkedNodeParams,
  setNodeFrame,
  setNodeLabel,
  setNodeLabelPosition,
  topLeftForCenter,
  translateDocument,
  type WireTap,
} from "@/lib/circuit/commands";
import { rotateSize, type Size } from "@/lib/circuit/geometry";
import type {
  CircuitDocument,
  CircuitNode,
  LabelPosition,
  PinRef,
  Point,
  Rotation,
  WireAnchor,
  WireEnd,
} from "@/lib/circuit/schema";
import { subcircuitLookup } from "@/lib/circuit/subcircuit";
import {
  type CreateSubcircuitResult,
  canInstantiate,
  createSubcircuit,
  dropSubcircuitPort,
  putSubcircuit,
  removeSubcircuit,
  renameSubcircuit,
  renameSubcircuitPort,
  subcircuitUsage,
} from "@/lib/circuit/subcircuit-commands";
import type { NodeDefinition, NodeLookup } from "@/lib/nodes/define";
import { lookupNode } from "@/lib/nodes/registry";
import {
  commit,
  createHistory,
  type History,
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  redo as historyRedo,
  undo as historyUndo,
} from "./history";
import { refreshProjects, registerOpenDocumentRename } from "./projects-store";
import { clearSelection } from "./selection";
import { readDocument, writeDocument } from "./storage";

/**
 * The document that is currently open, as an external store.
 *
 * This is the *only* thing that mutates a document. Components call the
 * commands below and subscribe with `useSyncExternalStore`; they never build a
 * new `CircuitDocument` themselves, which is what gives undo and autosave one
 * hook each instead of one per call site (Non-negotiable #9).
 *
 * The transforms are pure and live in `src/lib/circuit/commands.ts` — what
 * this module adds is the open document, the history stack, and persistence.
 *
 * It also owns *which* document is open. A project's own chips are documents
 * too (ADR 0010), and editing one is a path into the project rather than a
 * second editor: `getDocument` hands back the chip while it is open, every
 * command below edits that, and the write-back puts it into the root's
 * library. History, autosave and the project id all stay the root's, which is
 * what keeps `Ctrl+Z` working across the boundary and stops a chip from being
 * a thing that can be saved, or lost, on its own. See ADR 0012.
 */

const AUTOSAVE_DELAY_MS = 800;

let history: History<CircuitDocument> | null = null;

/** Bumped on every change so `getSnapshot` can hand back a stable value. */
const listeners = new Set<() => void>();

/**
 * True while the open document is not backed by storage — a shipped example.
 * It is a property of *this* document rather than a mode the editor is in, so
 * it is cleared by whatever replaces the document and never has to be reset by
 * a caller.
 */
let ephemeral = false;

/**
 * The chips being edited, outermost first; empty while the root circuit is
 * open. Only the last entry says which document is open — the library is flat,
 * so the rest is the trail back out, which is what the breadcrumb walks.
 */
let editPath: readonly string[] = [];

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let unsaved: CircuitDocument | null = null;
let saveError: string | null = null;

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity: the
 * save-state object has to keep the same reference until something in it
 * actually changes, or React re-renders forever.
 */
let saveState: SaveState = { pending: false, error: null };

export type SaveState = { pending: boolean; error: string | null };

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function setSaveState(next: SaveState) {
  if (next.pending === saveState.pending && next.error === saveState.error) {
    return;
  }
  saveState = next;
}

/**
 * Autosave lives in the store rather than in a `useDebouncedCallback` inside a
 * component: an edit must still reach storage if the editor unmounts on the
 * way out, and nothing here needs a render to happen first.
 */
function scheduleSave(document: CircuitDocument) {
  // The one gate on persistence, so an example is editable, undoable and
  // simulatable without any command, the history stack or the editor knowing
  // that it is not going to be written anywhere.
  if (ephemeral) return;

  unsaved = document;
  setSaveState({ pending: true, error: saveError });

  if (saveTimer !== null) return;
  if (typeof window === "undefined") return;

  saveTimer = setTimeout(flushSave, AUTOSAVE_DELAY_MS);
  window.addEventListener("beforeunload", flushSave);
}

/** Writes any pending edit immediately. Safe to call when nothing is pending. */
export function flushSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (typeof window !== "undefined") {
    window.removeEventListener("beforeunload", flushSave);
  }

  const document = unsaved;
  if (!document) return;
  unsaved = null;

  const result = writeDocument(document);
  saveError = result.ok ? null : result.error;
  setSaveState({ pending: false, error: saveError });

  // The sidebar reads name and node count from the index, which the write just
  // rebuilt; without this it would keep showing the counts from page load.
  refreshProjects();
  emit();
}

/**
 * Applies a command and records it.
 *
 * Everything below funnels through here, so "what does undo cover" and "what
 * gets saved" have exactly one answer each.
 */
type ApplyOptions = {
  coalesce?: boolean;
  /**
   * Runs on the finished root, after `change` and after the open chip has been
   * written back into it.
   *
   * It exists because an edit *inside* a chip can have consequences outside
   * it: a port's name is the pin id every instance's wires are stored against,
   * so renaming one has to reach those wires. Part of the same `apply`, so it
   * is part of the same undo step — the rename and the wires it moves are one
   * edit, not two.
   */
  root?: (root: CircuitDocument) => CircuitDocument;
};

function apply(
  label: string,
  change: (document: CircuitDocument) => CircuitDocument,
  options: ApplyOptions = {},
): boolean {
  if (!history) return false;

  const key = openSubcircuitKey();
  const present = history.present;

  let next: CircuitDocument;
  if (key === null) {
    next = change(present);
  } else {
    const open = getDocument();
    if (!open) return false;

    const edited = change(open);
    // Commands return the document they were given when they change nothing,
    // and the write-back below would otherwise make that a fresh object and so
    // a history entry that undoes nothing visible.
    if (edited === open) return false;

    // The open chip carries the root's library so that a chip built from other
    // chips resolves them while it is open. That library is the *root's*, so a
    // command that changed it — creating a chip from a selection inside this
    // one — writes its version back to the root and never into the chip.
    next = putSubcircuit(
      { ...present, subcircuits: edited.subcircuits ?? {} },
      key,
      withoutLibrary(edited),
    );
  }

  const { root, ...commitOptions } = options;
  const committed = commit(history, root ? root(next) : next, {
    label,
    ...commitOptions,
  });
  if (committed === history) return false;

  history = committed;
  normalizeEditPath();
  scheduleSave(history.present);
  emit();
  return true;
}

/**
 * Applies a command to the *root* document, whichever chip is open.
 *
 * The chip library belongs to the root, so renaming or deleting a chip is not
 * an edit to whatever happens to be on screen — including when what is on
 * screen is the chip being renamed.
 */
function applyToRoot(
  label: string,
  change: (document: CircuitDocument) => CircuitDocument,
): boolean {
  if (!history) return false;

  const committed = commit(history, change(history.present), { label });
  if (committed === history) return false;

  history = committed;
  normalizeEditPath();
  scheduleSave(history.present);
  emit();
  return true;
}

/** A chip as it is stored: never carrying a copy of the library it lives in. */
function withoutLibrary(document: CircuitDocument): CircuitDocument {
  if (!document.subcircuits) return document;

  const { subcircuits: _library, ...rest } = document;
  return rest;
}

/**
 * Drops any trailing chip that is no longer there — undone away, or deleted
 * while it was open. The editor then shows the document one level out rather
 * than an empty canvas whose title names something that does not exist.
 */
function normalizeEditPath(): void {
  const root = history?.present;
  if (!root) {
    setEditPath([]);
    return;
  }

  const kept: string[] = [];
  for (const key of editPath) {
    if (!root.subcircuits?.[key]) break;
    kept.push(key);
  }
  if (kept.length !== editPath.length) setEditPath(kept);
}

function setEditPath(next: readonly string[]): void {
  editPath = next;
  openFor = null;
}

/**
 * Finishes a step between documents.
 *
 * The selection goes with it: the ids in it name nodes in the document being
 * left, and carrying them across would anchor the inspector over a node the
 * canvas is no longer drawing. Done here rather than in an effect in the
 * editor, so the selection and the document can never be out of step even for
 * a render.
 */
function leaveDocument(): void {
  clearSelection();
  emit();
}

/**
 * Loads a document into the editor by id. False when there is no such thing.
 *
 * Storage first, then the shipped examples — one entry point, so the editor
 * asks for an id and never has to know which kind it got. An example opens
 * *ephemeral*: fully editable, undoable and simulatable, but nothing it does
 * reaches storage. Selecting it again therefore re-reads the pristine
 * catalogue copy, which is the honest consequence of never having saved.
 *
 * Storage wins a collision, so a project can never be shadowed by an example.
 */
export function openDocument(projectId: string): boolean {
  if (history?.present.id === projectId) return true;

  const loaded = readDocument(projectId);
  if (loaded?.ok) {
    adopt(loaded.document, false);
    return true;
  }

  const example = getExample(projectId);
  if (example) {
    adopt(example.document, true);
    return true;
  }

  return false;
}

/** Puts a document straight into the editor — an import, or a test fixture. */
export function setDocument(document: CircuitDocument): void {
  adopt(document, false);
}

export function closeDocument(): void {
  flushSave();
  history = null;
  ephemeral = false;
  setEditPath([]);
  emit();
}

/** The one place a document becomes *the* document, so `ephemeral` cannot drift. */
function adopt(document: CircuitDocument, isEphemeral: boolean): void {
  // Flushes the *outgoing* document, so this has to run before the flag moves.
  flushSave();

  history = createHistory(document);
  ephemeral = isEphemeral;
  // A new project opens at its root, never inside a chip the last one had open.
  setEditPath([]);
  saveError = null;
  setSaveState({ pending: false, error: null });
  emit();
}

/** True when edits to the open document are deliberately not being saved. */
export function isEphemeral(): boolean {
  return history !== null && ephemeral;
}

export function useIsEphemeral(): boolean {
  return useSyncExternalStore(subscribe, isEphemeral, () => false);
}

/**
 * The document being edited: the project, or the chip inside it that is open.
 *
 * Every command, the scene, the netlist and the simulation read this one, which
 * is what makes editing a chip the ordinary editor rather than a second one.
 */
export function getDocument(): CircuitDocument | null {
  const root = history?.present ?? null;
  if (!root) return null;

  const key = openSubcircuitKey();
  if (key === null) return root;

  const chip = root.subcircuits?.[key];
  if (!chip) return root;

  // Cached because `useSyncExternalStore` compares snapshots by identity: the
  // open chip has to be the same object until the root or the path changes.
  if (openFor?.root === root && openFor.key === key) return openChip;

  // The root's library, grafted on: a chip may instantiate other chips, and
  // they are all defined at the root (ADR 0010), so without this a chip's own
  // instances would be unresolvable for exactly as long as it was open.
  openChip = { ...chip, subcircuits: root.subcircuits };
  openFor = { root, key };
  return openChip;
}

/** The root project, chips and all — what history, autosave and the id belong to. */
export function getRootDocument(): CircuitDocument | null {
  return history?.present ?? null;
}

/** Key of the chip being edited, or null for the project itself. */
export function openSubcircuitKey(): string | null {
  return editPath.length > 0 ? editPath[editPath.length - 1] : null;
}

export function getSubcircuitPath(): readonly string[] {
  return editPath;
}

let openFor: { root: CircuitDocument; key: string } | null = null;
let openChip: CircuitDocument | null = null;

/**
 * Opens one of the project's chips for editing.
 *
 * Pushes onto the path rather than replacing it, so stepping into a chip from
 * inside another chip leaves a way back to where the user came from. False for
 * a key the project does not define.
 */
export function openSubcircuit(key: string): boolean {
  const root = history?.present;
  if (!root?.subcircuits?.[key]) return false;
  if (openSubcircuitKey() === key) return true;

  // Re-entering a chip already on the trail truncates back to it instead of
  // growing a path that visits it twice.
  const at = editPath.indexOf(key);
  setEditPath(at === -1 ? [...editPath, key] : editPath.slice(0, at + 1));
  leaveDocument();
  return true;
}

/** Steps back out one level. False at the root, where there is nowhere to go. */
export function closeSubcircuit(): boolean {
  if (editPath.length === 0) return false;

  setEditPath(editPath.slice(0, -1));
  leaveDocument();
  return true;
}

/** Back to the project itself, however deep in. */
export function closeAllSubcircuits(): boolean {
  if (editPath.length === 0) return false;

  setEditPath([]);
  leaveDocument();
  return true;
}

export function undo(): boolean {
  if (!history || !historyCanUndo(history)) return false;

  history = historyUndo(history);
  // The step may have taken away the chip that was open — undoing the edit
  // that created it, say — so the path is re-checked before anything reads it.
  normalizeEditPath();
  scheduleSave(history.present);
  emit();
  return true;
}

export function redo(): boolean {
  if (!history || !historyCanRedo(history)) return false;

  history = historyRedo(history);
  // The step may have taken away the chip that was open — undoing the edit
  // that created it, say — so the path is re-checked before anything reads it.
  normalizeEditPath();
  scheduleSave(history.present);
  emit();
  return true;
}

/**
 * Places a node with its *centre* on `worldCenter` — where a click or a drop
 * says it should be, rather than its top-left corner.
 */
export function placeNode(
  definition: NodeDefinition,
  worldCenter: Point,
  options: Omit<AddNodeOptions, "position"> = {},
): string | null {
  return placeNodes(definition, [worldCenter], options)[0] ?? null;
}

/**
 * Places several copies of one definition in a single edit — what a palette
 * batch drops on one click.
 *
 * One `apply` for the whole batch, so undo takes back the click the user made
 * rather than making them press `Ctrl+Z` six times for it.
 */
export function placeNodes(
  definition: NodeDefinition,
  worldCenters: readonly Point[],
  options: Omit<AddNodeOptions, "position"> = {},
): string[] {
  if (!history || worldCenters.length === 0) return [];

  const rotation: Rotation = options.rotation ?? 0;
  const params = { ...definition.defaultParams, ...options.params };

  const nodeIds: string[] = [];
  apply("place", (document) => {
    let next = document;
    for (const worldCenter of worldCenters) {
      const position = topLeftForCenter(
        definition,
        params,
        rotation,
        worldCenter,
      );
      const result = addNode(next, definition, { ...options, position });
      nodeIds.push(result.nodeId);
      next = result.document;
    }
    return next;
  });

  return nodeIds;
}

/**
 * `coalesce` folds a drag's many small moves into one undo step; pass it while
 * the pointer is down and drop it on the last move of the gesture.
 */
export function moveSelection(
  nodeIds: readonly string[],
  delta: Point,
  options: { snap?: boolean; coalesce?: boolean } = {},
): boolean {
  const { coalesce, ...moveOptions } = options;

  return apply(
    "move",
    (document) => moveNodes(document, nodeIds, delta, moveOptions),
    { coalesce },
  );
}

/** Shifts the whole open circuit — one undo step, like any other move. */
export function shiftOpenDocument(delta: Point): boolean {
  return apply("shift", (document) => translateDocument(document, delta));
}

export function rotateSelection(
  nodeIds: readonly string[],
  quarterTurns = 1,
): boolean {
  return apply("rotate", (document) =>
    rotateNodes(document, nodeIds, quarterTurns),
  );
}

export function updateNodeParams(
  nodeId: string,
  patch: Record<string, unknown>,
  options: { coalesce?: boolean } = {},
): boolean {
  const key = openSubcircuitKey();

  /**
   * Set when this edit changed a boundary port's name — `to` being null when
   * it was cleared, which takes the pin away rather than moving it.
   */
  let renamed: { from: string; to: string | null } | null = null;

  return apply(
    "params",
    (document) => {
      const next = setLinkedNodeParams(
        document,
        documentLookup(),
        nodeId,
        patch,
      );
      if (next === document || key === null) return next;

      // Asked of the definition before and after, so this is the port's own
      // declaration of what its pin is called and nothing here learns a node
      // type (Non-negotiable #4). Only the chip being edited has instances
      // whose wires could be on that pin.
      const from = boundaryPortName(document.nodes[nodeId]);
      const to = boundaryPortName(next.nodes[nodeId]);
      // A blank name defines no pin at all, so clearing one is a *removal*:
      // there is nowhere for the wires on that pin to go.
      if (from && from !== to) renamed = { from, to };

      return next;
    },
    {
      ...options,
      root: (root) => {
        if (!renamed || key === null) return root;

        return renamed.to === null
          ? dropSubcircuitPort(root, key, renamed.from)
          : renameSubcircuitPort(root, key, renamed.from, renamed.to);
      },
    },
  );
}

/** What this node calls its boundary pin, or null if it is not a port. */
function boundaryPortName(node: CircuitNode | undefined): string | null {
  if (!node) return null;

  const name = documentLookup()(node.type)?.boundaryPort?.(node.params)?.name;
  return name && name.length > 0 ? name : null;
}

/**
 * Gives a resizable node a new box — `position` in world units, `size` in grid
 * cells as it appears on the canvas. The size is turned back through the
 * node's rotation into the params its definition's `resize` names, so a group
 * turned on its side still grows along the axis the user dragged.
 *
 * `coalesce` folds a drag into one undo step, the same way a move does.
 */
export function resizeNode(
  nodeId: string,
  box: { position: Point; size: Size },
  options: { coalesce?: boolean } = {},
): boolean {
  return apply(
    "resize",
    (document) => {
      const node = document.nodes[nodeId];
      const resize = node && documentLookup()(node.type)?.resize;
      if (!node || !resize) return document;

      const size = rotateSize(box.size, node.rotation ?? 0);
      return setNodeFrame(document, nodeId, box.position, {
        [resize.width.key]: size.width,
        [resize.height.key]: size.height,
      });
    },
    options,
  );
}

export function updateNodeLabel(nodeId: string, label: string): boolean {
  return apply("label", (document) => setNodeLabel(document, nodeId, label));
}

export function updateNodeLabelPosition(
  nodeId: string,
  position: LabelPosition,
): boolean {
  return apply("label position", (document) =>
    setNodeLabelPosition(document, nodeId, position),
  );
}

/**
 * Renames the open document.
 *
 * The name lives in the document, so this is the path for a document that is
 * open — `renameProject` in `projects-store.ts` reads and rewrites the stored
 * copy, which would lose whatever this store has not autosaved yet.
 */
export function renameOpenDocument(name: string): boolean {
  return apply("rename", (document) => renameDocument(document, name));
}

// So `renameProject` can be the one entry point without importing this store
// back — it is imported from here, and the cycle would be real.
registerOpenDocumentRename((id, name) => {
  if (getRootDocument()?.id !== id) return null;
  return renameOpenDocument(name)
    ? { ok: true }
    : { ok: false, error: "Name cannot be empty" };
});

/**
 * Sets the zoom the open circuit opens at, and that "reset view" returns to.
 *
 * A document edit like any other: it is in the save format, so it belongs to
 * undo and autosave rather than to the viewport, which owns only the *current*
 * transform and nothing that outlives the session.
 */
export function setOpenDocumentDefaultZoom(zoom: number): boolean {
  // The project's, not the open chip's: it is what "reset view" returns to
  // everywhere in the circuit, and a per-chip zoom nothing in the UI offers to
  // set would be a setting the user could only reach by accident.
  return applyToRoot("zoom", (document) => setDefaultZoom(document, zoom));
}

export function connectPins(
  from: WireEnd,
  to: PinRef,
  waypoints: readonly Point[] = [],
): ConnectResult {
  const open = getDocument();
  if (!open) return { ok: false, reason: "missing-pin" };

  // The open document's lookup, not the bare registry: a wire landing on a
  // chip instance's pin has to find that pin, and only this resolves `sub.*`.
  const result = connect(open, documentLookup(), from, to, waypoints);
  if (result.ok) apply("connect", () => result.document);

  return result;
}

/**
 * Lands the wire in progress on another wire instead of on a pin.
 *
 * The tap and the wire that reads it are one command, so this is one undo step
 * — the same as landing on a pin, and unlike the right-click branch, which is
 * a bend first and a wire second because the user may still be drawing it.
 */
export function connectPinToWire(
  from: WireEnd,
  tap: WireTap,
  waypoints: readonly Point[] = [],
): ConnectResult {
  const open = getDocument();
  if (!open) return { ok: false, reason: "missing-pin" };

  const result = connectToWire(open, documentLookup(), from, tap, waypoints);
  if (result.ok) apply("connect", () => result.document);

  return result;
}

export type WireBranch = { anchor: WireAnchor; world: Point };

/**
 * Taps a wire at `point` and reports the bend to start a branch from.
 *
 * The tap is an ordinary waypoint on the wire, so dragging it afterwards
 * drags the branch's start with it — there is one point and both wires read
 * it. The branch is on the same net because the netlist resolves the anchor
 * through to the tapped wire's own end, not because anything is copied.
 *
 * One `apply`, so the bend is a single undo step; the wire drawn out of it is
 * a second, ordinary `connectPins` when it lands.
 */
export function branchWire(
  wireId: string,
  slot: number,
  point: Point,
): WireBranch | null {
  const open = getDocument();
  if (!open) return null;

  const result = branchWireAt(open, wireId, slot, point);
  if (!result) return null;

  apply("branch", () => result.document);
  return { anchor: result.anchor, world: result.world };
}

/**
 * Adds a bend to a wire at `index`, snapped to the grid.
 *
 * `coalesce` folds it into the drag that follows, so inserting a bend and
 * dragging it into place is one undo step rather than two.
 */
export function addWireWaypoint(
  wireId: string,
  index: number,
  point: Point,
): boolean {
  return apply("waypoints", (document) =>
    insertWireWaypoint(document, wireId, index, point),
  );
}

/** Moves one bend. Coalesced, because a drag emits one of these per frame. */
export function dragWireWaypoint(
  wireId: string,
  index: number,
  point: Point,
): boolean {
  return apply(
    "waypoints",
    (document) => moveWireWaypoint(document, wireId, index, point),
    { coalesce: true },
  );
}

/** Drops one bend, straightening the wire through where it used to be. */
export function dropWireWaypoint(wireId: string, index: number): boolean {
  return apply(
    "waypoints",
    (document) => removeWireWaypoint(document, wireId, index),
    { coalesce: true },
  );
}

export function deleteSelection(selection: Selection): boolean {
  const key = openSubcircuitKey();

  // Ports going with this delete take a pin off every instance of the chip,
  // and the wires on those pins have nowhere to go. Read before the delete,
  // since afterwards there is no node left to ask.
  const ports =
    key === null
      ? []
      : (selection.nodeIds ?? [])
          .map((nodeId) => boundaryPortName(getDocument()?.nodes[nodeId]))
          .filter((name): name is string => name !== null);

  return apply("delete", (document) => deleteElements(document, selection), {
    root: (root) =>
      key === null
        ? root
        : ports.reduce(
            (next, name) => dropSubcircuitPort(next, key, name),
            root,
          ),
  });
}

/**
 * Runs the document steps of an assistant plan against the open document as
 * one edit, so "place two things and wire them" is one `Ctrl+Z`.
 *
 * The plan is executed here, against the document as it is now, rather than
 * trusted as it was when the request left — see `executeSteps`. Null with
 * nothing open.
 */
export function applyAssistantSteps(
  steps: readonly IndexedStep[],
  context: ExecutionContext,
): ExecutionResult | null {
  const open = getDocument();
  if (!open) return null;

  const key = openSubcircuitKey();
  const result = executeSteps(open, documentLookup(), steps, context);
  if (result.problems.length > 0 || result.document === open) return result;

  // Inside a chip, a port the plan removed or renamed is a pin on every
  // instance outside it — the same follow-through `deleteSelection` and
  // `updateNodeParams` give an edit made by hand, in the same undo step.
  const ports = key === null ? [] : portChanges(open, result.document);
  apply("assistant", () => result.document, {
    root: (root) =>
      key === null
        ? root
        : ports.reduce(
            (next, { from, to }) =>
              to === null
                ? dropSubcircuitPort(next, key, from)
                : renameSubcircuitPort(next, key, from, to),
            root,
          ),
  });
  return result;
}

/** Boundary ports whose pin an edit took away (`to` null) or renamed. */
function portChanges(
  before: CircuitDocument,
  after: CircuitDocument,
): { from: string; to: string | null }[] {
  const changes: { from: string; to: string | null }[] = [];
  for (const node of Object.values(before.nodes)) {
    const from = boundaryPortName(node);
    if (from === null) continue;
    const to = boundaryPortName(after.nodes[node.id]);
    if (from !== to) changes.push({ from, to });
  }
  return changes;
}

/** The selection as standalone data, for the clipboard. Null with nothing open. */
export function copySelection(selection: Selection): Fragment | null {
  const open = getDocument();
  if (!open) return null;

  const fragment = extractFragment(open, selection);
  return fragment.nodes.length > 0 ? fragment : null;
}

/**
 * Pastes a fragment and returns what to select — the copies, never the
 * originals, so the user can immediately drag what they just pasted.
 */
export function pasteFragment(
  fragment: Fragment,
  offset: Point,
): { nodeIds: string[]; wireIds: string[] } | null {
  if (!history) return null;

  let pasted: { nodeIds: string[]; wireIds: string[] } | null = null;
  apply("paste", (document) => {
    const result = insertFragment(document, fragment, offset);
    pasted = result.selection;
    return result.document;
  });

  return pasted;
}

/** `Ctrl+D`: copy in place, nudged off the original so both are visible. */
export function duplicateSelection(
  selection: Selection,
  offset: Point,
): { nodeIds: string[]; wireIds: string[] } | null {
  const fragment = copySelection(selection);
  return fragment ? pasteFragment(fragment, offset) : null;
}

/**
 * Turns the selection into one of the project's chips, in its place.
 *
 * One `apply`, so the whole thing — the chip, the instance, and every wire
 * re-pointed at it — is a single undo step. The chip is added to the *root's*
 * library even when the selection was inside another chip, because that is
 * where chips live (ADR 0010).
 */
export function createSubcircuitFromSelection(
  selection: Selection,
  name: string,
): CreateSubcircuitResult | null {
  if (!history) return null;

  let created: CreateSubcircuitResult | null = null;
  apply("subcircuit", (document) => {
    const result = createSubcircuit(document, documentLookup(), selection, {
      name,
    });
    if (!result) return document;

    created = result;
    return result.document;
  });

  return created;
}

/** Renames a chip. Its key, and so every instance of it, is untouched. */
export function renameSubcircuitByKey(key: string, name: string): boolean {
  return applyToRoot("rename chip", (document) =>
    renameSubcircuit(document, key, name),
  );
}

/**
 * Deletes a chip and every instance of it, anywhere in the project.
 *
 * Leaves the chip if it is the one open, stepping out of it first: an editor
 * showing a document that is no longer in the project is not a state worth
 * having, and the path normalisation would drop it a moment later anyway.
 */
export function deleteSubcircuitByKey(key: string): boolean {
  if (!history?.present.subcircuits?.[key]) return false;

  if (editPath.includes(key)) {
    setEditPath(editPath.slice(0, editPath.indexOf(key)));
  }
  return applyToRoot("delete chip", (document) =>
    removeSubcircuit(document, key),
  );
}

/** Every instance of a chip, for a delete prompt that says what it will take. */
export function subcircuitInstances(key: string): number {
  const root = history?.present;
  return root ? subcircuitUsage(root, key).length : 0;
}

/**
 * May a chip be placed in the document that is open? False only when it would
 * make a chip contain itself.
 */
export function canPlaceSubcircuit(key: string): boolean {
  const root = history?.present;
  return root ? canInstantiate(root, openSubcircuitKey(), key) : false;
}

/**
 * The registry, plus the project's own chips as node types.
 *
 * Every surface that resolves a `type` reads it from here — the scene, the
 * inspector, the palette, the simulation — so the pins the canvas draws on an
 * instance and the pins the netlist ties up can never come from two different
 * places. It is derived from the *root*, since that is where the library is,
 * and cached on it so the memo does not churn on every pan.
 */
export function documentLookup(): NodeLookup {
  const library = history?.present.subcircuits;
  if (!library) return lookupNode;

  // Keyed on the *library*, not the document: a chip's definition is derived
  // from its contents, and the scene caches its layout against the definition
  // object, so handing out a new one on every keystroke would throw away the
  // layout of every instance on the canvas. The library only changes when a
  // chip does, which is exactly when those definitions are stale.
  if (lookupFor !== library) {
    lookupFor = library;
    cachedLookup = subcircuitLookup({ subcircuits: library }, lookupNode);
  }
  return cachedLookup;
}

let lookupFor: CircuitDocument["subcircuits"] | null = null;
let cachedLookup: NodeLookup = lookupNode;

/** Null until a document is opened, and on the server. */
export function useDocument(): CircuitDocument | null {
  return useSyncExternalStore(subscribe, getDocument, () => null);
}

/** The project the open document belongs to — the chip library's owner. */
export function useRootDocument(): CircuitDocument | null {
  return useSyncExternalStore(subscribe, getRootDocument, () => null);
}

export function useSubcircuitPath(): readonly string[] {
  return useSyncExternalStore(subscribe, getSubcircuitPath, () => EMPTY_PATH);
}

const EMPTY_PATH: readonly string[] = [];

/**
 * `documentLookup`, for a component. Memoised on the project's chip library
 * for the reason spelled out there: stable definitions are what let the scene
 * keep the layout it has already computed for every instance on the canvas.
 */
export function useDocumentLookup(): NodeLookup {
  const library = useRootDocument()?.subcircuits;
  return useMemo(
    () =>
      library
        ? subcircuitLookup({ subcircuits: library }, lookupNode)
        : lookupNode,
    [library],
  );
}

const EMPTY_HISTORY_STATE = { canUndo: false, canRedo: false };

/**
 * Recomputed per call and memoised on the stack it describes, because
 * `useSyncExternalStore` needs a stable reference between changes.
 */
let historyStateFor: History<CircuitDocument> | null = null;
let historyState = EMPTY_HISTORY_STATE;

function getHistoryState() {
  if (!history) return EMPTY_HISTORY_STATE;
  if (historyStateFor === history) return historyState;

  historyStateFor = history;
  historyState = {
    canUndo: historyCanUndo(history),
    canRedo: historyCanRedo(history),
  };
  return historyState;
}

export function useHistoryState() {
  return useSyncExternalStore(
    subscribe,
    getHistoryState,
    () => EMPTY_HISTORY_STATE,
  );
}

const IDLE_SAVE_STATE: SaveState = { pending: false, error: null };

/** The same value `useSaveState` serves, for callers outside React. */
export function getSaveState(): SaveState {
  return saveState;
}

export function useSaveState(): SaveState {
  return useSyncExternalStore(
    subscribe,
    () => saveState,
    () => IDLE_SAVE_STATE,
  );
}

/** Test seam: drops the open document, history, and any pending write. */
export function resetDocumentStore(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  history = null;
  ephemeral = false;
  setEditPath([]);
  unsaved = null;
  saveError = null;
  saveState = IDLE_SAVE_STATE;
  emit();
}

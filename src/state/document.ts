"use client";

import { useSyncExternalStore } from "react";

import {
  type AddNodeOptions,
  addNode,
  type ConnectResult,
  connect,
  deleteElements,
  extractFragment,
  type Fragment,
  insertFragment,
  moveNodes,
  renameDocument,
  rotateNodes,
  type Selection,
  setDefaultZoom,
  setNodeLabel,
  setNodeParams,
  setWireWaypoints,
  topLeftForCenter,
} from "@/lib/circuit/commands";
import type {
  CircuitDocument,
  PinRef,
  Point,
  Rotation,
} from "@/lib/circuit/schema";
import type { NodeDefinition } from "@/lib/nodes/define";
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
import { refreshProjects } from "./projects-store";
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
 */

const AUTOSAVE_DELAY_MS = 800;

let history: History<CircuitDocument> | null = null;

/** Bumped on every change so `getSnapshot` can hand back a stable value. */
const listeners = new Set<() => void>();

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
function apply(
  label: string,
  change: (document: CircuitDocument) => CircuitDocument,
  options: { coalesce?: boolean } = {},
): boolean {
  if (!history) return false;

  const next = change(history.present);
  const committed = commit(history, next, { label, ...options });
  if (committed === history) return false;

  history = committed;
  scheduleSave(history.present);
  emit();
  return true;
}

/** Loads a stored document into the editor. False when it is missing. */
export function openDocument(projectId: string): boolean {
  if (history?.present.id === projectId) return true;

  flushSave();

  const loaded = readDocument(projectId);
  if (!loaded?.ok) return false;

  history = createHistory(loaded.document);
  saveError = null;
  setSaveState({ pending: false, error: null });
  emit();
  return true;
}

/** Puts a document straight into the editor — an import, or a test fixture. */
export function setDocument(document: CircuitDocument): void {
  flushSave();
  history = createHistory(document);
  emit();
}

export function closeDocument(): void {
  flushSave();
  history = null;
  emit();
}

export function getDocument(): CircuitDocument | null {
  return history?.present ?? null;
}

export function undo(): boolean {
  if (!history || !historyCanUndo(history)) return false;

  history = historyUndo(history);
  scheduleSave(history.present);
  emit();
  return true;
}

export function redo(): boolean {
  if (!history || !historyCanRedo(history)) return false;

  history = historyRedo(history);
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
  if (!history) return null;

  const rotation: Rotation = options.rotation ?? 0;
  const params = { ...definition.defaultParams, ...options.params };
  const position = topLeftForCenter(definition, params, rotation, worldCenter);

  let nodeId: string | null = null;
  apply("place", (document) => {
    const result = addNode(document, definition, { ...options, position });
    nodeId = result.nodeId;
    return result.document;
  });

  return nodeId;
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
  return apply(
    "params",
    (document) => setNodeParams(document, nodeId, patch),
    options,
  );
}

export function updateNodeLabel(nodeId: string, label: string): boolean {
  return apply("label", (document) => setNodeLabel(document, nodeId, label));
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

/**
 * Sets the zoom the open circuit opens at, and that "reset view" returns to.
 *
 * A document edit like any other: it is in the save format, so it belongs to
 * undo and autosave rather than to the viewport, which owns only the *current*
 * transform and nothing that outlives the session.
 */
export function setOpenDocumentDefaultZoom(zoom: number): boolean {
  return apply("zoom", (document) => setDefaultZoom(document, zoom));
}

export function connectPins(from: PinRef, to: PinRef): ConnectResult {
  if (!history) return { ok: false, reason: "missing-pin" };

  const result = connect(history.present, lookupNode, from, to);
  if (result.ok) apply("connect", () => result.document);

  return result;
}

export function updateWireWaypoints(
  wireId: string,
  waypoints: readonly Point[],
  options: { snap?: boolean; coalesce?: boolean } = {},
): boolean {
  const { coalesce, ...waypointOptions } = options;

  return apply(
    "waypoints",
    (document) =>
      setWireWaypoints(document, wireId, waypoints, waypointOptions),
    { coalesce },
  );
}

export function deleteSelection(selection: Selection): boolean {
  return apply("delete", (document) => deleteElements(document, selection));
}

/** The selection as standalone data, for the clipboard. Null with nothing open. */
export function copySelection(selection: Selection): Fragment | null {
  if (!history) return null;

  const fragment = extractFragment(history.present, selection);
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

/** Null until a document is opened, and on the server. */
export function useDocument(): CircuitDocument | null {
  return useSyncExternalStore(subscribe, getDocument, () => null);
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
  unsaved = null;
  saveError = null;
  saveState = IDLE_SAVE_STATE;
  emit();
}

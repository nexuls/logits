"use client";

import { useSyncExternalStore } from "react";

/**
 * What is selected, as an external store.
 *
 * Separate from the document because selection is not part of a circuit: it is
 * never saved, never undone, and never shared with someone opening the file.
 * Keeping it out of the document store also means a rubber-band drag — which
 * changes the selection on every pointer move — never touches history.
 *
 * The snapshot is a frozen object of sorted arrays rather than `Set`s, so
 * `useSyncExternalStore` can compare it by identity and callers can pass it
 * straight to a command as a `Selection`.
 */

export type SelectionState = {
  readonly nodeIds: readonly string[];
  readonly wireIds: readonly string[];
};

export const EMPTY_SELECTION: SelectionState = Object.freeze({
  nodeIds: Object.freeze([]) as readonly string[],
  wireIds: Object.freeze([]) as readonly string[],
});

let state: SelectionState = EMPTY_SELECTION;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) listener();
}

/** Sorted and deduplicated, so two equal selections compare equal below. */
function normalize(ids: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(ids)].sort());
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

function set(nodeIds: Iterable<string>, wireIds: Iterable<string>) {
  const next: SelectionState = {
    nodeIds: normalize(nodeIds),
    wireIds: normalize(wireIds),
  };

  // Identity has to stay stable when nothing moved: a pointer-move handler
  // re-selects the same elements many times a second, and every one of those
  // would otherwise re-render the whole node layer.
  if (
    sameIds(next.nodeIds, state.nodeIds) &&
    sameIds(next.wireIds, state.wireIds)
  ) {
    return;
  }

  state = Object.freeze(next);
  emit();
}

export function getSelection(): SelectionState {
  return state;
}

export function selectOnly(
  nodeIds: readonly string[],
  wireIds: readonly string[] = [],
): void {
  set(nodeIds, wireIds);
}

export function clearSelection(): void {
  set([], []);
}

export function addToSelection(
  nodeIds: readonly string[],
  wireIds: readonly string[] = [],
): void {
  set([...state.nodeIds, ...nodeIds], [...state.wireIds, ...wireIds]);
}

/** Shift/Ctrl-click semantics: in the selection, or out of it. */
export function toggleInSelection(kind: "node" | "wire", id: string): void {
  const key = kind === "node" ? "nodeIds" : "wireIds";
  const current = state[key];
  const next = current.includes(id)
    ? current.filter((entry) => entry !== id)
    : [...current, id];

  set(
    key === "nodeIds" ? next : state.nodeIds,
    key === "wireIds" ? next : state.wireIds,
  );
}

export function isSelected(kind: "node" | "wire", id: string): boolean {
  return (kind === "node" ? state.nodeIds : state.wireIds).includes(id);
}

/**
 * Drops ids that are no longer in the document — after a delete, an undo, or
 * a document swap. Called by the editor rather than by the document store, so
 * this module keeps no dependency on the document.
 */
export function pruneSelection(
  hasNode: (id: string) => boolean,
  hasWire: (id: string) => boolean,
): void {
  set(state.nodeIds.filter(hasNode), state.wireIds.filter(hasWire));
}

export function useSelection(): SelectionState {
  return useSyncExternalStore(subscribe, getSelection, () => EMPTY_SELECTION);
}

/** Test seam, and what a document close calls. */
export function resetSelection(): void {
  state = EMPTY_SELECTION;
  emit();
}

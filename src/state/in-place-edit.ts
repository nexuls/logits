"use client";

import { useSyncExternalStore } from "react";

/**
 * Which node, if any, is being edited on the canvas itself — a note typed
 * into where it sits rather than into the inspector
 * (`NodeDefinition.editInPlace`).
 *
 * A store of its own for the same reasons as the selection: it is never saved
 * and never undone, and the edit it stands for reaches the document only as
 * one command when the session ends. One node at a time, so two editors never
 * compete for the keyboard.
 */

let editingNodeId: string | null = null;
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

export function getEditingNodeId(): string | null {
  return editingNodeId;
}

export function beginInPlaceEdit(nodeId: string): void {
  if (editingNodeId === nodeId) return;
  editingNodeId = nodeId;
  emit();
}

/**
 * Ends the session on `nodeId` only, so a late call from an editor that has
 * already been replaced cannot close the one that replaced it.
 */
export function endInPlaceEdit(nodeId: string): void {
  if (editingNodeId !== nodeId) return;
  editingNodeId = null;
  emit();
}

export function useEditingNodeId(): string | null {
  return useSyncExternalStore(subscribe, getEditingNodeId, () => null);
}

"use client";

import { useSyncExternalStore } from "react";
import { createDocumentId } from "@/lib/circuit/ids";
import { createEmptyDocument } from "@/lib/circuit/io";
import type { CircuitDocument, ProjectMeta } from "@/lib/circuit/schema";
import {
  DOCUMENT_KEY_PREFIX,
  INDEX_KEY,
  readDocument,
  readProjects,
  removeDocument,
  type StorageResult,
  updateProjectMeta,
  writeDocument,
} from "./storage";

/**
 * The project list as an external store.
 *
 * `localStorage` has no change notification of its own, so every mutation goes
 * through this module and invalidates the snapshot. Components read it with
 * `useSyncExternalStore`, which also gets the server render right: there is no
 * storage during SSR, so the server snapshot is empty and the real list appears
 * on hydration — no `Date.now()` reaching the server, no mismatch.
 */

const listeners = new Set<() => void>();

/**
 * `getSnapshot` must return a stable reference between changes or React
 * re-renders forever, so the parsed list is cached until something invalidates
 * it rather than being re-read per call.
 */
let snapshot: ProjectMeta[] | null = null;

const EMPTY: ProjectMeta[] = [];

function onStorageEvent(event: StorageEvent) {
  // Fires only for *other* tabs, which is exactly the case local writes miss.
  if (
    event.key === null ||
    event.key === INDEX_KEY ||
    event.key.startsWith(DOCUMENT_KEY_PREFIX)
  ) {
    invalidate();
  }
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    window.addEventListener("storage", onStorageEvent);
  }
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      window.removeEventListener("storage", onStorageEvent);
    }
  };
}

function getSnapshot(): ProjectMeta[] {
  snapshot ??= readProjects();
  return snapshot;
}

function getServerSnapshot(): ProjectMeta[] {
  return EMPTY;
}

function invalidate() {
  snapshot = null;
  for (const listener of listeners) listener();
}

/** Sorted pinned-first, then newest first. Empty until hydration. */
export function useProjects(): ProjectMeta[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export function createProject(name = "Untitled circuit"): CreateResult {
  const document = createEmptyDocument(uniqueName(name));
  const result = writeDocument(document);
  invalidate();

  return result.ok ? { ok: true, id: document.id } : result;
}

/**
 * Copies a document into storage as a brand new project — what "import" does
 * to a shipped example, and to anything else that is on screen without being
 * saved.
 *
 * A fresh document id rather than the source's, so importing the same example
 * twice gives two independent projects instead of one overwriting the other.
 * Element ids are kept: they only have to be unique within a document.
 */
export function createProjectFrom(source: CircuitDocument): CreateResult {
  const document: CircuitDocument = {
    ...source,
    id: createDocumentId(),
    name: uniqueName(source.name),
  };

  const result = writeDocument(document);
  invalidate();

  return result.ok ? { ok: true, id: document.id } : result;
}

/**
 * Renames through the document, so the file and the index cannot disagree.
 * An index entry whose document has gone missing is still renamed, because a
 * list that refuses to change is worse than one pointing at a lost circuit.
 */
export function renameProject(id: string, name: string): StorageResult {
  const trimmed = name.trim();
  if (trimmed.length === 0) return { ok: false, error: "Name cannot be empty" };

  const loaded = readDocument(id);
  const result = loaded?.ok
    ? writeDocument({ ...loaded.document, name: trimmed })
    : updateProjectMeta(id, { name: trimmed });

  invalidate();
  return result;
}

export function deleteProject(id: string): StorageResult {
  const result = removeDocument(id);
  invalidate();
  return result;
}

export function pinProject(id: string, pinned: boolean): StorageResult {
  // `undefined` rather than `false` so an unpinned project serialises the same
  // way it did before it was ever pinned.
  const result = updateProjectMeta(id, { pinned: pinned || undefined });
  invalidate();
  return result;
}

/**
 * Re-reads the index after something outside this module wrote a document —
 * the autosave in `document.ts`. Without it the sidebar would keep showing the
 * name and node count from page load.
 */
export function refreshProjects(): void {
  invalidate();
}

/** Loads a project's circuit. Null when it is missing. */
export function openProject(id: string): CircuitDocument | null {
  const loaded = readDocument(id);
  return loaded?.ok ? loaded.document : null;
}

/** "Untitled circuit", then "Untitled circuit 2" — never a silent duplicate. */
function uniqueName(base: string): string {
  const taken = new Set(getSnapshot().map((project) => project.name));
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base} ${suffix}`)) suffix++;
  return `${base} ${suffix}`;
}

/**
 * False on the server and through hydration, true afterwards. Lets a component
 * show placeholders instead of flashing an empty state before storage is read.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

import { z } from "zod";
import { fromJson, type LoadResult, serialize } from "@/lib/circuit/io";
import {
  type CircuitDocument,
  type ProjectMeta,
  projectMetaSchema,
} from "@/lib/circuit/schema";

/**
 * `localStorage` persistence.
 *
 * This lives in `src/state/` rather than `src/lib/` on purpose: the domain
 * layer must stay pure and runnable in a plain Node test, so it knows about
 * serialisation but never about the browser. Swapping this file for IndexedDB
 * or a server is meant to leave `src/lib/circuit/io.ts` untouched.
 *
 * Every function is safe to call during SSR and in a browser with storage
 * blocked; reads fall back to empty and writes report failure instead of
 * throwing.
 */

export const DOCUMENT_KEY_PREFIX = "logits:doc:";
export const INDEX_KEY = "logits:index";

const INDEX_VERSION = 1;

const projectIndexSchema = z.object({
  version: z.int().positive(),
  projects: z.array(projectMetaSchema),
});

export type StorageResult = { ok: true } | { ok: false; error: string };

export const documentKey = (id: string) => `${DOCUMENT_KEY_PREFIX}${id}`;

function storage(): Storage | null {
  // Private-mode Safari and blocked third-party contexts throw on access,
  // not just on write, so this has to be inside the try.
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function describe(error: unknown): string {
  if (error instanceof DOMException && error.name === "QuotaExceededError") {
    return "Browser storage is full — export the circuit to a file.";
  }
  return error instanceof Error ? error.message : "Storage is unavailable";
}

export function isStorageAvailable(): boolean {
  return storage() !== null;
}

/** Returns `null` when nothing is stored under `id`. */
export function readDocument(id: string): LoadResult | null {
  const store = storage();
  if (!store) return null;

  let text: string | null;
  try {
    text = store.getItem(documentKey(id));
  } catch {
    return null;
  }
  if (text === null) return null;

  try {
    return fromJson(JSON.parse(text));
  } catch (error) {
    return {
      ok: false,
      issues: [{ code: "invalid-json", message: describe(error) }],
    };
  }
}

/** Writes the document and refreshes its entry in the project index. */
export function writeDocument(
  document: CircuitDocument,
  now = Date.now(),
): StorageResult {
  const store = storage();
  if (!store) return { ok: false, error: "Storage is unavailable" };

  try {
    store.setItem(documentKey(document.id), serialize(document));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }

  return upsertProject({
    id: document.id,
    name: document.name,
    updatedAt: now,
    nodeCount: Object.keys(document.nodes).length,
    pinned: readProjects().find((p) => p.id === document.id)?.pinned,
  });
}

export function removeDocument(id: string): StorageResult {
  const store = storage();
  if (!store) return { ok: false, error: "Storage is unavailable" };

  try {
    store.removeItem(documentKey(id));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  return writeProjects(readProjects().filter((project) => project.id !== id));
}

/** Newest first, pinned projects ahead of the rest. */
export function readProjects(): ProjectMeta[] {
  const store = storage();
  if (!store) return [];

  let text: string | null;
  try {
    text = store.getItem(INDEX_KEY);
  } catch {
    return [];
  }
  if (text === null) return [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return [];
  }

  const index = projectIndexSchema.safeParse(raw);
  if (!index.success || index.data.version > INDEX_VERSION) return [];

  return [...index.data.projects].sort(
    (a, b) =>
      Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
      b.updatedAt - a.updatedAt,
  );
}

export function setProjectPinned(id: string, pinned: boolean): StorageResult {
  const projects = readProjects();
  const project = projects.find((entry) => entry.id === id);
  if (!project) return { ok: false, error: `Unknown project "${id}"` };

  return upsertProject({ ...project, pinned: pinned || undefined });
}

function upsertProject(meta: ProjectMeta): StorageResult {
  const others = readProjects().filter((project) => project.id !== meta.id);
  return writeProjects([...others, meta]);
}

function writeProjects(projects: ProjectMeta[]): StorageResult {
  const store = storage();
  if (!store) return { ok: false, error: "Storage is unavailable" };

  try {
    store.setItem(
      INDEX_KEY,
      JSON.stringify({ version: INDEX_VERSION, projects }),
    );
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  return { ok: true };
}

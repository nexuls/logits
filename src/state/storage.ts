import { z } from "zod";
import { clampScale, type Viewport } from "@/lib/circuit/coords";
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
  // The remembered view goes with it — an id is never reused, so leaving it
  // behind would only ever be an orphan.
  removeViewport(id);
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

/**
 * Patches an index entry without touching the document — for changes the
 * document does not own, like pinning. A rename goes through `writeDocument`
 * instead, because the document is the source of truth for a project's name.
 */
export function updateProjectMeta(
  id: string,
  patch: Partial<Omit<ProjectMeta, "id">>,
): StorageResult {
  const project = readProjects().find((entry) => entry.id === id);
  if (!project) return { ok: false, error: `Unknown project "${id}"` };

  return upsertProject({ ...project, ...patch });
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

/**
 * Where the user last left the view on a project.
 *
 * Deliberately not part of the document: it is per-browser workspace state
 * like `editor-settings.ts`, nobody opening a shared `.logits.json` should
 * inherit someone else's scroll position, and keeping it out of the save
 * format means it needs no migration.
 */

export const VIEW_KEY_PREFIX = "logits:view:";

export const viewKey = (id: string) => `${VIEW_KEY_PREFIX}${id}`;

const storedViewSchema = z.object({
  scale: z.number().finite(),
  offset: z.object({ x: z.number().finite(), y: z.number().finite() }),
});

/** Returns `null` when nothing usable is stored for `id`. */
export function readViewport(id: string): Viewport | null {
  const store = storage();
  if (!store) return null;

  let text: string | null;
  try {
    text = store.getItem(viewKey(id));
  } catch {
    return null;
  }
  if (text === null) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }

  const view = storedViewSchema.safeParse(raw);
  if (!view.success) return null;

  // Clamped on the way out, not on the way in: the limits are the current
  // build's, and a view written by an older one must still be usable.
  return {
    scale: clampScale(view.data.scale),
    offset: view.data.offset,
  };
}

export function writeViewport(id: string, view: Viewport): StorageResult {
  const store = storage();
  if (!store) return { ok: false, error: "Storage is unavailable" };

  try {
    store.setItem(viewKey(id), JSON.stringify(view));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  return { ok: true };
}

export function removeViewport(id: string): StorageResult {
  const store = storage();
  if (!store) return { ok: false, error: "Storage is unavailable" };

  try {
    store.removeItem(viewKey(id));
  } catch (error) {
    return { ok: false, error: describe(error) };
  }
  return { ok: true };
}

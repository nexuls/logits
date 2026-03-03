/**
 * Implements all IndexedDB persistence operations for app data.
 *
 * Responsibility:
 * - Read/write global metadata snapshots and track their hash/version state.
 * - Persist on-demand page content records.
 * - Manage local mutation queue entries for offline-first optimistic workflows.
 */
import type { T_Page_Meta } from "@/types/types";
import {
  metadataSnapshotSchema,
  mutationSchema,
  pageContentSchema,
  type MetadataSnapshot,
  type MutationRecord,
} from "./contracts";
import { getDb } from "./db";
import { emitMetadataChanged } from "./events";
import { sha256FromUnknown } from "./hash";

function createMutationId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

async function writeMetadataSnapshot(snapshot: MetadataSnapshot) {
  const db = await getDb();
  const normalized = metadataSnapshotSchema.parse(snapshot);
  const hash = await sha256FromUnknown(normalized.projects);

  await db.put("metadata", {
    key: "global",
    snapshot: normalized,
    hash,
    updatedAt: nowIso(),
  });

  await db.put("sync", {
    key: "metadata_hash",
    value: hash,
    updatedAt: nowIso(),
  });

  emitMetadataChanged({ hash });

  return { snapshot: normalized, hash };
}

export async function ensureMetadataSnapshot(seed: MetadataSnapshot) {
  const db = await getDb();
  const existing = await db.get("metadata", "global");

  if (existing) {
    return metadataSnapshotSchema.parse(existing.snapshot);
  }

  const { snapshot } = await writeMetadataSnapshot(seed);
  return snapshot;
}

export async function getMetadataSnapshot() {
  const db = await getDb();
  const existing = await db.get("metadata", "global");

  if (!existing) {
    return null;
  }

  return metadataSnapshotSchema.parse(existing.snapshot);
}

export async function setMetadataSnapshot(snapshot: MetadataSnapshot) {
  return writeMetadataSnapshot(snapshot);
}

export async function getStoredMetadataHash() {
  const db = await getDb();
  const hashRecord = await db.get("sync", "metadata_hash");

  return hashRecord?.value ?? "";
}

export async function renameProject(projectId: string, newName: string) {
  const currentSnapshot = await getMetadataSnapshot();

  if (!currentSnapshot) {
    return null;
  }

  const nextProjects = currentSnapshot.projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          name: newName,
          updatedAt: nowIso(),
        }
      : project,
  );

  const mutation: MutationRecord = mutationSchema.parse({
    id: createMutationId(),
    type: "project.rename",
    payload: { projectId, newName },
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.put("mutations", mutation);

  const { snapshot } = await writeMetadataSnapshot({
    ...currentSnapshot,
    projects: nextProjects,
    version: currentSnapshot.version + 1,
    updatedAt: nowIso(),
  });

  await db.delete("mutations", mutation.id);

  return snapshot;
}

export async function createProject(name?: string) {
  const currentSnapshot = await getMetadataSnapshot();

  if (!currentSnapshot) {
    return null;
  }

  const nextProject = {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : createMutationId(),
    name: name?.trim() || "Untitled project",
    updatedAt: nowIso(),
    pages: [],
  };

  const mutation: MutationRecord = mutationSchema.parse({
    id: createMutationId(),
    type: "project.create",
    payload: { project: nextProject },
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.put("mutations", mutation);

  const { snapshot } = await writeMetadataSnapshot({
    ...currentSnapshot,
    projects: [nextProject, ...currentSnapshot.projects],
    version: currentSnapshot.version + 1,
    updatedAt: nowIso(),
  });

  await db.delete("mutations", mutation.id);

  return snapshot;
}

export async function updateProjectPages(
  projectId: string,
  pages: T_Page_Meta[],
) {
  const currentSnapshot = await getMetadataSnapshot();

  if (!currentSnapshot) {
    return null;
  }

  const nextProjects = currentSnapshot.projects.map((project) =>
    project.id === projectId
      ? {
          ...project,
          pages: pages.map((page) => ({ ...page })),
          updatedAt: nowIso(),
        }
      : project,
  );

  const mutation: MutationRecord = mutationSchema.parse({
    id: createMutationId(),
    type: "project.pages.update",
    payload: { projectId, pages },
    createdAt: Date.now(),
  });

  const db = await getDb();
  await db.put("mutations", mutation);

  const { snapshot } = await writeMetadataSnapshot({
    ...currentSnapshot,
    projects: nextProjects,
    version: currentSnapshot.version + 1,
    updatedAt: nowIso(),
  });

  await db.delete("mutations", mutation.id);

  return snapshot;
}

export async function getPageContent(pageId: string) {
  const db = await getDb();
  const stored = await db.get("content", pageId);

  if (!stored) {
    return null;
  }

  return pageContentSchema.parse(stored);
}

export async function upsertPageContent(pageId: string, content: string) {
  const db = await getDb();
  const hash = await sha256FromUnknown(content);

  const record = pageContentSchema.parse({
    pageId,
    content,
    hash,
    updatedAt: nowIso(),
  });

  const mutation: MutationRecord = mutationSchema.parse({
    id: createMutationId(),
    type: "content.upsert",
    payload: { pageId, hash },
    createdAt: Date.now(),
  });

  await db.put("mutations", mutation);
  await db.put("content", record);
  await db.delete("mutations", mutation.id);

  return record;
}

export async function flushMutationQueue() {
  const db = await getDb();
  const allMutations = await db.getAll("mutations");

  if (!allMutations.length) {
    return;
  }

  await Promise.all(allMutations.map((item) => db.delete("mutations", item.id)));
}

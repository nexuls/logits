/**
 * Exposes the public data-layer API consumed by UI providers and components.
 *
 * Responsibility:
 * - Provide high-level metadata/content operations.
 * - Ensure first-run metadata seeding from the active adapter.
 * - Keep UI code decoupled from low-level repository and IndexedDB details.
 */
import type { T_Page_Meta } from "@/types/types";
import { indexedDbBootstrapAdapter } from "./adapters";
import type { MetadataSnapshot } from "./contracts";
import {
  createProject,
  deleteProject,
  duplicateProject,
  ensureMetadataSnapshot,
  getMetadataSnapshot,
  getPageContent,
  pinProject,
  renameProject,
  setMetadataSnapshot,
  updateProjectPages,
  upsertPageContent,
} from "./repositories";

async function ensureSeededSnapshot() {
  const existing = await getMetadataSnapshot();

  if (existing) {
    return existing;
  }

  const seed = await indexedDbBootstrapAdapter.loadMetadataSnapshot();
  return ensureMetadataSnapshot(seed);
}

export async function loadGlobalMetadata() {
  return ensureSeededSnapshot();
}

export async function setGlobalMetadata(snapshot: MetadataSnapshot) {
  const { snapshot: nextSnapshot } = await setMetadataSnapshot(snapshot);
  return nextSnapshot;
}

export async function renameProjectMetadata(projectId: string, newName: string) {
  return renameProject(projectId, newName);
}

export async function createProjectMetadata(name?: string) {
  return createProject(name);
}

export async function duplicateProjectMetadata(projectId: string) {
  return duplicateProject(projectId);
}

export async function deleteProjectMetadata(projectId: string) {
  return deleteProject(projectId);
}

export async function pinProjectMetadata(projectId: string) {
  return pinProject(projectId);
}

export async function updateProjectPagesMetadata(
  projectId: string,
  pages: T_Page_Meta[],
) {
  return updateProjectPages(projectId, pages);
}

export async function loadPageContentOnDemand(page: T_Page_Meta) {
  const existing = await getPageContent(page.id);

  if (existing) {
    return existing;
  }

  const initialContent = await indexedDbBootstrapAdapter.getInitialContent(page);
  return upsertPageContent(page.id, initialContent);
}

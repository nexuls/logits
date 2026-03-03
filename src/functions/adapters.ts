/**
 * Declares source-adapter interfaces and local bootstrap implementations.
 *
 * Responsibility:
 * - Define contracts for metadata and content sources.
 * - Provide the current IndexedDB bootstrap adapter used before backend integration.
 */
import type { T_Page_Meta, T_Project } from "@/types/types";
import type { MetadataSnapshot } from "./contracts";

export type MetadataSourceAdapter = {
  loadMetadataSnapshot: () => Promise<MetadataSnapshot>;
};

export type ContentSourceAdapter = {
  getInitialContent: (page: T_Page_Meta) => Promise<string>;
};

function createInitialProjects(projects: T_Project[]): T_Project[] {
  return projects.map((project) => ({
    ...project,
    pages: project.pages.map((page) => ({ ...page })),
  }));
}

export const indexedDbBootstrapAdapter: MetadataSourceAdapter &
  ContentSourceAdapter = {
  async loadMetadataSnapshot() {
    return {
      projects: createInitialProjects([]),
      version: 1,
      updatedAt: new Date().toISOString(),
    };
  },
  async getInitialContent() {
    return "";
  },
};

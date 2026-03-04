"use client";

/**
 * Global metadata provider for client-side app state backed by the local data layer.
 *
 * Responsibility:
 * - Hydrate project metadata from IndexedDB.
 * - Expose optimistic mutation actions that keep UI in sync.
 * - Trigger on-demand content retrieval for selected pages.
 * - Listen to sync events and refresh shared metadata state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { T_Page_Meta, T_Project } from "@/types/types";
import {
  createProjectMetadata,
  deleteProjectMetadata,
  duplicateProjectMetadata,
  loadGlobalMetadata,
  loadPageContentOnDemand,
  pinProjectMetadata,
  renameProjectMetadata,
  savePageContent,
  updateProjectPagesMetadata,
} from "@/functions";
import { startLocalSync } from "@/functions/sync";

type MetadataContextValue = {
  projects: T_Project[];
  isHydrating: boolean;
  createProject: (name?: string) => Promise<T_Project | null>;
  duplicateProject: (projectId: string) => Promise<T_Project | null>;
  deleteProject: (projectId: string) => Promise<T_Project | null>;
  pinProject: (projectId: string) => Promise<void>;
  renameProject: (projectId: string, newName: string) => Promise<void>;
  updateProjectPages: (projectId: string, pages: T_Page_Meta[]) => Promise<void>;
  getPageContent: (page: T_Page_Meta) => Promise<string>;
  updatePageContent: (pageId: string, content: string) => Promise<void>;
};

const MetadataContext = createContext<MetadataContextValue | null>(null);

/**
 * Provides globally shared metadata state and data-layer actions.
 */
export function MetadataProvider({ children }: { children: ReactNode }) {
  const [projects, setProjects] = useState<T_Project[]>([]);
  const [isHydrating, setIsHydrating] = useState(true);

  const hydrate = useCallback(async () => {
    const snapshot = await loadGlobalMetadata();
    setProjects(snapshot.projects);
    setIsHydrating(false);
  }, []);

  useEffect(() => {
    void hydrate();

    const stopSync = startLocalSync({
      onSynced: () => {
        void hydrate();
      },
    });

    return () => {
      stopSync();
    };
  }, [hydrate]);

  const renameProject = useCallback(
    async (projectId: string, newName: string) => {
      const currentProjects = projects;
      const optimisticProjects = currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, name: newName, updatedAt: new Date().toISOString() }
          : project,
      );

      setProjects(optimisticProjects);

      try {
        const snapshot = await renameProjectMetadata(projectId, newName);

        if (snapshot) {
          setProjects(snapshot.projects);
        }
      } catch {
        setProjects(currentProjects);
      }
    },
    [projects],
  );

  const createProject = useCallback(
    async (name?: string) => {
      const currentProjects = projects;
      const optimisticProject: T_Project = {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: name?.trim() || "Untitled project",
        updatedAt: new Date().toISOString(),
        pages: [],
      };

      setProjects([optimisticProject, ...currentProjects]);

      try {
        const snapshot = await createProjectMetadata(name);

        if (snapshot) {
          setProjects(snapshot.projects);
          return snapshot.projects[0] ?? null;
        }

        setProjects(currentProjects);
        return null;
      } catch {
        setProjects(currentProjects);
        return null;
      }
    },
    [projects],
  );

  const duplicateProject = useCallback(
    async (projectId: string) => {
      const currentProjects = projects;

      try {
        const snapshot = await duplicateProjectMetadata(projectId);

        if (snapshot) {
          setProjects(snapshot.projects);
          return snapshot.projects[0] ?? null;
        }

        return null;
      } catch {
        setProjects(currentProjects);
        return null;
      }
    },
    [projects],
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const currentProjects = projects;
      const optimisticProjects = currentProjects.filter(
        (project) => project.id !== projectId,
      );

      setProjects(optimisticProjects);

      try {
        const snapshot = await deleteProjectMetadata(projectId);

        if (snapshot) {
          setProjects(snapshot.projects);
          return snapshot.projects[0] ?? null;
        }

        setProjects(currentProjects);
        return null;
      } catch {
        setProjects(currentProjects);
        return null;
      }
    },
    [projects],
  );

  const pinProject = useCallback(
    async (projectId: string) => {
      const currentProjects = projects;
      const optimisticProjects = currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, updatedAt: new Date().toISOString() }
          : project,
      );

      setProjects(optimisticProjects);

      try {
        const snapshot = await pinProjectMetadata(projectId);

        if (snapshot) {
          setProjects(snapshot.projects);
          return;
        }

        setProjects(currentProjects);
      } catch {
        setProjects(currentProjects);
      }
    },
    [projects],
  );

  const updateProjectPages = useCallback(
    async (projectId: string, pages: T_Page_Meta[]) => {
      const currentProjects = projects;
      const optimisticProjects = currentProjects.map((project) =>
        project.id === projectId
          ? { ...project, pages, updatedAt: new Date().toISOString() }
          : project,
      );

      setProjects(optimisticProjects);

      try {
        const snapshot = await updateProjectPagesMetadata(projectId, pages);

        if (snapshot) {
          setProjects(snapshot.projects);
        }
      } catch {
        setProjects(currentProjects);
      }
    },
    [projects],
  );

  const getPageContent = useCallback(async (page: T_Page_Meta) => {
    const content = await loadPageContentOnDemand(page);
    return content.content;
  }, []);

  const updatePageContent = useCallback(
    async (pageId: string, content: string) => {
      await savePageContent(pageId, content);
    },
    [],
  );

  const value = useMemo(
    () => ({
      projects,
      isHydrating,
      createProject,
      duplicateProject,
      deleteProject,
      pinProject,
      renameProject,
      updateProjectPages,
      getPageContent,
      updatePageContent,
    }),
    [
      projects,
      isHydrating,
      createProject,
      duplicateProject,
      deleteProject,
      pinProject,
      renameProject,
      updateProjectPages,
      getPageContent,
      updatePageContent,
    ],
  );

  return (
    <MetadataContext.Provider value={value}>{children}</MetadataContext.Provider>
  );
}

/**
 * Accessor hook for metadata state and mutations.
 */
export function useMetadata() {
  const context = useContext(MetadataContext);

  if (!context) {
    throw new Error("useMetadata must be used inside MetadataProvider");
  }

  return context;
}

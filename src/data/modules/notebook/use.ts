"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "../../context";
import type { NotebookFileType } from "./schema";

export function useNotebookModule() {
  const { store, isHydrating } = useDataStore();

  const list = useCallback(async () => {
    return store.notebook.list();
  }, [store]);

  const getById = useCallback(
    async (notebookId: string) => {
      return store.notebook.getById(notebookId);
    },
    [store],
  );

  const createNotebook = useCallback(
    async (name?: string) => {
      return store.createNotebook(name);
    },
    [store],
  );

  const deleteNotebook = useCallback(
    async (notebookId: string) => {
      return store.deleteNotebookCascade(notebookId);
    },
    [store],
  );

  const createFileWithInitialContent = useCallback(
    async (input: {
      notebookId: string;
      parentId: string;
      type: NotebookFileType;
      name?: string;
      content?: string;
    }) => {
      return store.createFileWithInitialContent(input);
    },
    [store],
  );

  return useMemo(
    () => ({
      isHydrating,
      list,
      getById,
      createNotebook,
      deleteNotebook,
      createFileWithInitialContent,
    }),
    [
      isHydrating,
      list,
      getById,
      createNotebook,
      deleteNotebook,
      createFileWithInitialContent,
    ],
  );
}

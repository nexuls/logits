"use client";

import { useCallback, useMemo } from "react";
import type { T_File, T_File_Type, T_Notebook } from "@/types/types";
import { useData } from "@/components/providers/data";
import {
  createFile,
  createNotebook,
  deleteFile,
  deleteNotebook,
  duplicateFile,
  getNotebookFiles,
  moveFile,
  renameFile,
  renameNotebook,
  reorderFiles,
  updateFileContent,
} from "@/data/notebooks";

export function useNotebooks() {
  const { data, isHydrating, updateData } = useData();

  const notebooks = data.notebooks;
  const files = data.files;

  const createNotebookAction = useCallback(
    async (name?: string): Promise<T_Notebook | null> => {
      let createdNotebook: T_Notebook | null = null;

      await updateData((currentData) => {
        const result = createNotebook(currentData, name);
        createdNotebook = result.notebook;
        return result.data;
      });

      return createdNotebook;
    },
    [updateData],
  );

  const renameNotebookAction = useCallback(
    async (notebookId: string, name: string) => {
      await updateData((currentData) =>
        renameNotebook(currentData, notebookId, name),
      );
    },
    [updateData],
  );

  const deleteNotebookAction = useCallback(
    async (notebookId: string): Promise<T_Notebook | null> => {
      let fallbackNotebook: T_Notebook | null = null;

      await updateData((currentData) => {
        const nextData = deleteNotebook(currentData, notebookId);
        fallbackNotebook = nextData.notebooks[0] ?? null;
        return nextData;
      });

      return fallbackNotebook;
    },
    [updateData],
  );

  const createFileAction = useCallback(
    async (options: {
      notebookId: string;
      parentId: string;
      type: T_File_Type;
      name?: string;
    }): Promise<T_File | null> => {
      let createdFile: T_File | null = null;

      await updateData((currentData) => {
        const result = createFile(currentData, options);
        createdFile = result.file;
        return result.data;
      });

      return createdFile;
    },
    [updateData],
  );

  const renameFileAction = useCallback(
    async (fileId: string, name: string) => {
      await updateData((currentData) => renameFile(currentData, fileId, name));
    },
    [updateData],
  );

  const deleteFileAction = useCallback(
    async (fileId: string) => {
      await updateData((currentData) => deleteFile(currentData, fileId));
    },
    [updateData],
  );

  const duplicateFileAction = useCallback(
    async (fileId: string): Promise<T_File | null> => {
      let createdFile: T_File | null = null;

      await updateData((currentData) => {
        const result = duplicateFile(currentData, fileId);
        createdFile = result.file;
        return result.data;
      });

      return createdFile;
    },
    [updateData],
  );

  const reorderFilesAction = useCallback(
    async (parentId: string, orderedIds: string[]) => {
      await updateData((currentData) =>
        reorderFiles(currentData, parentId, orderedIds),
      );
    },
    [updateData],
  );

  const moveFileAction = useCallback(
    async (fileId: string, parentId: string, index: number) => {
      await updateData((currentData) => moveFile(currentData, fileId, parentId, index));
    },
    [updateData],
  );

  const updateFileContentAction = useCallback(
    async (fileId: string, content: string) => {
      await updateData((currentData) =>
        updateFileContent(currentData, fileId, content),
      );
    },
    [updateData],
  );

  const getNotebookFilesAction = useCallback(
    (notebookId: string) => {
      return getNotebookFiles(data, notebookId);
    },
    [data],
  );

  return useMemo(
    () => ({
      data,
      notebooks,
      files,
      isHydrating,
      createNotebook: createNotebookAction,
      renameNotebook: renameNotebookAction,
      deleteNotebook: deleteNotebookAction,
      createFile: createFileAction,
      renameFile: renameFileAction,
      deleteFile: deleteFileAction,
      duplicateFile: duplicateFileAction,
      reorderFiles: reorderFilesAction,
      moveFile: moveFileAction,
      updateFileContent: updateFileContentAction,
      getNotebookFiles: getNotebookFilesAction,
    }),
    [
      data,
      notebooks,
      files,
      isHydrating,
      createNotebookAction,
      renameNotebookAction,
      deleteNotebookAction,
      createFileAction,
      renameFileAction,
      deleteFileAction,
      duplicateFileAction,
      reorderFilesAction,
      moveFileAction,
      updateFileContentAction,
      getNotebookFilesAction,
    ],
  );
}

"use client";

import { useCallback, useMemo } from "react";
import { useDataStore } from "@/data/context";
import {
  toClientFile,
  toClientNotebook,
  type AppFile,
  type FileType,
  type Notebook,
} from "@/data/modules/notebook/client-types";

export function useNotebooks() {
  const {
    store,
    notebookRecords,
    fileContents,
    isHydrating,
    setNotebookRecords,
    setFileContents,
  } = useDataStore();

  const notebooks = useMemo<Notebook[]>(
    () => notebookRecords.map((record) => toClientNotebook(record)),
    [notebookRecords],
  );

  const files = useMemo<AppFile[]>(() => {
    const items: AppFile[] = [];

    for (const notebook of notebookRecords) {
      for (const file of notebook.files) {
        const content = fileContents.get(file.id)?.content ?? "";
        items.push(toClientFile(file, content));
      }
    }

    return items;
  }, [fileContents, notebookRecords]);

  const getNotebookFiles = useCallback(
    (notebookId: string) => {
      const notebook = notebookRecords.find((item) => item.id === notebookId);
      if (!notebook) return [] as AppFile[];

      const byId = new Map(notebook.files.map((file) => [file.id, file]));
      const childrenByParent = new Map<string, typeof notebook.files>();

      for (const file of notebook.files) {
        const children = childrenByParent.get(file.parentId) ?? [];
        children.push(file);
        childrenByParent.set(file.parentId, children);
      }

      const sortFiles = (items: typeof notebook.files) => {
        return [...items].sort((first, second) => {
          if (first.order !== second.order) return first.order - second.order;
          return first.name.localeCompare(second.name);
        });
      };

      const queue = sortFiles(childrenByParent.get(notebookId) ?? []).map(
        (file) => file.id,
      );
      const visibleFiles: AppFile[] = [];

      while (queue.length > 0) {
        const nextId = queue.shift();
        if (!nextId) continue;

        const nextFile = byId.get(nextId);
        if (!nextFile) continue;

        const content = fileContents.get(nextFile.id)?.content ?? "";
        visibleFiles.push(toClientFile(nextFile, content));

        const children = sortFiles(childrenByParent.get(nextFile.id) ?? []);
        for (const child of children) {
          queue.push(child.id);
        }
      }

      return visibleFiles;
    },
    [fileContents, notebookRecords],
  );

  const getFileContent = useCallback(
    async (fileId: string) => {
      const cached = fileContents.get(fileId);

      if (cached) {
        return cached.content;
      }

      const loaded = await store.fileContent.getById(fileId);

      if (!loaded) {
        return "";
      }

      setFileContents((current) => {
        const next = new Map(current);
        next.set(fileId, loaded);
        return next;
      });

      return loaded.content;
    },
    [fileContents, setFileContents, store],
  );

  const createNotebook = useCallback(
    async (name?: string): Promise<Notebook | null> => {
      const created = await store.createNotebook(name);
      return created ? toClientNotebook(created) : null;
    },
    [store],
  );

  const renameNotebook = useCallback(
    async (notebookId: string, name: string) => {
      await store.renameNotebook(notebookId, name);
    },
    [store],
  );

  const deleteNotebook = useCallback(
    async (notebookId: string): Promise<Notebook | null> => {
      await store.deleteNotebookCascade(notebookId);
      const fallbackNotebook =
        notebookRecords.find((item) => item.id !== notebookId) ?? null;
      return fallbackNotebook ? toClientNotebook(fallbackNotebook) : null;
    },
    [notebookRecords, store],
  );

  const createFile = useCallback(
    async (options: {
      notebookId: string;
      parentId: string;
      type: FileType;
      name?: string;
    }): Promise<AppFile | null> => {
      const created = await store.createFileWithInitialContent({
        ...options,
        content: "",
      });

      if (!created?.file) return null;

      setFileContents((current) => {
        const next = new Map(current);
        next.set(created.file.id, {
          key: created.file.id,
          id: created.file.id,
          content: "",
          charCount: 0,
          lineCount: 0,
          byteSize: 0,
          createdAt: created.file.createdAt,
          updatedAt: created.file.updatedAt,
        });
        return next;
      });

      return toClientFile(created.file, "");
    },
    [setFileContents, store],
  );

  const renameFile = useCallback(
    async (fileId: string, name: string) => {
      await store.enqueueWrite(async () => {
        const notebookId = await store.notebook.findNotebookIdForFile(fileId);
        if (!notebookId) return;
        await store.notebook.renameFile(notebookId, fileId, name);
      });
    },
    [store],
  );

  const deleteFile = useCallback(
    async (fileId: string) => {
      await store.enqueueWrite(async () => {
        const notebookId = await store.notebook.findNotebookIdForFile(fileId);
        if (!notebookId) return;

        const notebook = await store.notebook.getById(notebookId);
        const target = notebook?.files.find((file) => file.id === fileId);
        if (!notebook || !target) return;

        const descendantIds = new Set<string>();
        const stack = [fileId];

        while (stack.length > 0) {
          const parentId = stack.pop();
          if (!parentId) continue;

          for (const child of notebook.files) {
            if (child.parentId !== parentId || descendantIds.has(child.id))
              continue;
            descendantIds.add(child.id);
            stack.push(child.id);
          }
        }

        descendantIds.add(fileId);
        await store.notebook.deleteFile(notebookId, fileId);
        await store.fileContent.deleteMany([...descendantIds]);
      });
    },
    [store],
  );

  const duplicateFile = useCallback(
    async (fileId: string): Promise<AppFile | null> => {
      let duplicated: AppFile | null = null;

      await store.enqueueWrite(async () => {
        const notebookId = await store.notebook.findNotebookIdForFile(fileId);
        if (!notebookId) return;

        const result = await store.notebook.duplicateFile(notebookId, fileId);
        if (!result.file) return;

        const sourceContent = await store.fileContent.getById(fileId);
        const duplicatedRootContent = sourceContent?.content ?? "";

        for (const clonedId of result.clonedIds) {
          await store.fileContent.upsert(clonedId, duplicatedRootContent);
        }

        duplicated = toClientFile(result.file, duplicatedRootContent);
      });

      return duplicated;
    },
    [store],
  );

  const reorderFiles = useCallback(
    async (parentId: string, orderedIds: string[]) => {
      await store.enqueueWrite(async () => {
        const firstFileId = orderedIds[0] ?? "";
        const notebookId =
          await store.notebook.findNotebookIdForFile(firstFileId);
        if (!notebookId) return;
        await store.notebook.reorderFiles(notebookId, parentId, orderedIds);
      });
    },
    [store],
  );

  const moveFile = useCallback(
    async (fileId: string, parentId: string, index: number) => {
      await store.enqueueWrite(async () => {
        const notebookId = await store.notebook.findNotebookIdForFile(fileId);
        if (!notebookId) return;
        await store.notebook.moveFile(notebookId, fileId, parentId, index);
      });
    },
    [store],
  );

  const updateFileContent = useCallback(
    async (fileId: string, content: string) => {
      const notebookId = await store.notebook.findNotebookIdForFile(fileId);
      if (!notebookId) return;
      await store.updateFileContent(notebookId, fileId, content);

      const timestamp = new Date().toISOString();
      const byteSize = new TextEncoder().encode(content).length;

      setNotebookRecords((current) =>
        current.map((notebook) => {
          if (notebook.id !== notebookId) return notebook;

          return {
            ...notebook,
            updatedAt: timestamp,
            files: notebook.files.map((file) =>
              file.id === fileId
                ? {
                    ...file,
                    size: byteSize,
                    updatedAt: timestamp,
                  }
                : file,
            ),
          };
        }),
      );

      setFileContents((current) => {
        const existing = current.get(fileId);
        const next = new Map(current);

        next.set(fileId, {
          key: fileId,
          id: fileId,
          content,
          charCount: content.length,
          lineCount: content.length === 0 ? 0 : content.split("\n").length,
          byteSize,
          createdAt: existing?.createdAt ?? timestamp,
          updatedAt: timestamp,
        });

        return next;
      });
    },
    [setFileContents, setNotebookRecords, store],
  );

  return useMemo(
    () => ({
      notebooks,
      files,
      isHydrating,
      createNotebook,
      renameNotebook,
      deleteNotebook,
      createFile,
      renameFile,
      deleteFile,
      duplicateFile,
      reorderFiles,
      moveFile,
      updateFileContent,
      getFileContent,
      getNotebookFiles,
    }),
    [
      notebooks,
      files,
      isHydrating,
      createNotebook,
      renameNotebook,
      deleteNotebook,
      createFile,
      renameFile,
      deleteFile,
      duplicateFile,
      reorderFiles,
      moveFile,
      updateFileContent,
      getFileContent,
      getNotebookFiles,
    ],
  );
}

export type { AppFile, FileType, Notebook };

import { DataModule, type ModuleScope } from "@/data/dataModule";
import type { DbLike } from "@/data/dataModule";
import {
  notebookFileSchema,
  notebookSchema,
  type NotebookFile,
  type NotebookFileType,
  type NotebookRecord,
} from "./schema";

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getActorId() {
  return "local-user";
}

function sortFiles(files: NotebookFile[]) {
  return [...files].sort((first, second) => {
    if (first.order !== second.order) return first.order - second.order;
    if (first.type === "folder" && second.type !== "folder") return -1;
    if (first.type !== "folder" && second.type === "folder") return 1;
    return first.name.localeCompare(second.name);
  });
}

function getChildren(files: NotebookFile[], parentId: string) {
  return sortFiles(files.filter((file) => file.parentId === parentId));
}

function getDescendantIds(files: NotebookFile[], rootId: string) {
  const ids = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const parentId = stack.pop();
    if (!parentId) continue;

    for (const child of files) {
      if (child.parentId !== parentId || ids.has(child.id)) continue;
      ids.add(child.id);
      stack.push(child.id);
    }
  }

  return ids;
}

export class NotebookModule extends DataModule<NotebookRecord> {
  constructor(getDb: () => Promise<DbLike>) {
    super("notebooks", notebookSchema, getDb);
  }

  async list(scope?: ModuleScope) {
    return this.readAllRecords(scope);
  }

  async getById(notebookId: string, scope?: ModuleScope) {
    return this.readRecord(notebookId, scope);
  }

  async create(name?: string, scope?: ModuleScope) {
    const timestamp = nowIso();
    const record = notebookSchema.parse({
      id: createId(),
      name: name?.trim() || "Untitled notebook",
      files: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: getActorId(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(record, scope);
    return record;
  }

  async rename(notebookId: string, name: string, scope?: ModuleScope) {
    const current = await this.getById(notebookId, scope);
    if (!current) return null;

    return this.saveRecord(
      {
        ...current,
        name,
        updatedAt: nowIso(),
        updatedBy: getActorId(),
      },
      scope,
    );
  }

  async createFile(
    notebookId: string,
    options: {
      parentId: string;
      type: NotebookFileType;
      name?: string;
    },
    scope?: ModuleScope,
  ) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const defaultNames: Record<NotebookFileType, string> = {
      folder: "Untitled folder",
      file: "Untitled note",
      draw: "Untitled drawing",
      image: "Untitled image",
    };

    const timestamp = nowIso();
    const file = notebookFileSchema.parse({
      id: createId(),
      name: options.name?.trim() || defaultNames[options.type],
      type: options.type,
      parentId: options.parentId,
      order: getChildren(notebook.files, options.parentId).length,
      url: "",
      size: 0,
      isPublic: false,
      isShared: false,
      sharedWith: [],
      tags: [],
      enabledFeatures: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: getActorId(),
      updatedBy: getActorId(),
    });

    const updated = notebookSchema.parse({
      ...notebook,
      files: [...notebook.files, file],
      updatedAt: timestamp,
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return { notebook: updated, file };
  }

  async renameFile(
    notebookId: string,
    fileId: string,
    name: string,
    scope?: ModuleScope,
  ) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const updated = notebookSchema.parse({
      ...notebook,
      files: notebook.files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              name,
              updatedAt: nowIso(),
              updatedBy: getActorId(),
            }
          : file,
      ),
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return updated;
  }

  async updateFileContentStats(
    notebookId: string,
    fileId: string,
    content: string,
    scope?: ModuleScope,
  ) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const byteSize = new TextEncoder().encode(content).length;
    const updated = notebookSchema.parse({
      ...notebook,
      files: notebook.files.map((file) =>
        file.id === fileId
          ? {
              ...file,
              size: byteSize,
              updatedAt: nowIso(),
              updatedBy: getActorId(),
            }
          : file,
      ),
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return updated;
  }

  async deleteNotebook(notebookId: string, scope?: ModuleScope) {
    const current = await this.getById(notebookId, scope);
    if (!current) return null;
    await this.removeRecord(notebookId, scope);
    return current;
  }

  async deleteFile(notebookId: string, fileId: string, scope?: ModuleScope) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const target = notebook.files.find((file) => file.id === fileId);
    if (!target) return notebook;

    const deleteIds = getDescendantIds(notebook.files, fileId);
    deleteIds.add(fileId);

    const remainingFiles = notebook.files.filter((file) => !deleteIds.has(file.id));
    const siblings = getChildren(remainingFiles, target.parentId);
    const reordered = remainingFiles.map((file) => {
      if (file.parentId !== target.parentId) return file;

      return {
        ...file,
        order: siblings.findIndex((sibling) => sibling.id === file.id),
      };
    });

    const updated = notebookSchema.parse({
      ...notebook,
      files: reordered,
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return updated;
  }

  async duplicateFile(notebookId: string, fileId: string, scope?: ModuleScope) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return { notebook: null, file: null, clonedIds: [] as string[] };

    const target = notebook.files.find((file) => file.id === fileId);
    if (!target) return { notebook, file: null, clonedIds: [] as string[] };

    const descendantIds = getDescendantIds(notebook.files, fileId);
    const tree = notebook.files.filter(
      (file) => file.id === fileId || descendantIds.has(file.id),
    );
    const idMap = new Map<string, string>();

    for (const file of tree) {
      idMap.set(file.id, createId());
    }

    const clones = tree.map((file) => {
      const nextId = idMap.get(file.id) ?? createId();
      const isRoot = file.id === fileId;

      return {
        ...file,
        id: nextId,
        name: isRoot ? `${file.name} copy` : file.name,
        parentId: isRoot
          ? target.parentId
          : (idMap.get(file.parentId) ?? target.parentId),
        updatedAt: nowIso(),
        updatedBy: getActorId(),
        createdAt: nowIso(),
        createdBy: getActorId(),
      };
    });

    const siblingIds = getChildren([...notebook.files, ...clones], target.parentId).map(
      (file) => file.id,
    );
    const targetIndex = siblingIds.indexOf(fileId);
    const rootCloneId = clones[0]?.id ?? "";
    const reorderedIds = siblingIds.filter((id) => id !== rootCloneId);
    reorderedIds.splice(targetIndex + 1, 0, rootCloneId);

    const updated = notebookSchema.parse({
      ...notebook,
      files: [...notebook.files, ...clones].map((file) => {
        if (file.parentId !== target.parentId) return file;

        return {
          ...file,
          order: reorderedIds.indexOf(file.id),
        };
      }),
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return {
      notebook: updated,
      file: clones[0] ?? null,
      clonedIds: clones.map((file) => file.id),
    };
  }

  async reorderFiles(
    notebookId: string,
    parentId: string,
    orderedIds: string[],
    scope?: ModuleScope,
  ) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const updated = notebookSchema.parse({
      ...notebook,
      files: notebook.files.map((file) => {
        if (file.parentId !== parentId) return file;

        return {
          ...file,
          order: orderedIds.indexOf(file.id),
        };
      }),
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return updated;
  }

  async moveFile(
    notebookId: string,
    fileId: string,
    nextParentId: string,
    nextIndex: number,
    scope?: ModuleScope,
  ) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return null;

    const target = notebook.files.find((file) => file.id === fileId);

    if (!target || target.id === nextParentId) {
      return notebook;
    }

    if (target.type === "folder" && getDescendantIds(notebook.files, fileId).has(nextParentId)) {
      return notebook;
    }

    const previousParentId = target.parentId;
    const nextFiles = notebook.files.map((file) =>
      file.id === fileId
        ? {
            ...file,
            parentId: nextParentId,
            updatedAt: nowIso(),
            updatedBy: getActorId(),
          }
        : file,
    );

    const previousSiblingIds = getChildren(nextFiles, previousParentId).map((file) => file.id);
    const nextSiblingIds = getChildren(nextFiles, nextParentId)
      .map((file) => file.id)
      .filter((id) => id !== fileId);
    const safeIndex = Math.max(0, Math.min(nextIndex, nextSiblingIds.length));
    nextSiblingIds.splice(safeIndex, 0, fileId);
    const reorderedIds =
      previousParentId === nextParentId ? nextSiblingIds : previousSiblingIds;

    const updated = notebookSchema.parse({
      ...notebook,
      files: nextFiles.map((file) => {
        if (file.parentId === previousParentId) {
          return {
            ...file,
            order: reorderedIds.indexOf(file.id),
          };
        }

        if (previousParentId !== nextParentId && file.parentId === nextParentId) {
          return {
            ...file,
            order: nextSiblingIds.indexOf(file.id),
          };
        }

        return file;
      }),
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    });

    await this.saveRecord(updated, scope);
    return updated;
  }

  async findNotebookIdForFile(fileId: string, scope?: ModuleScope) {
    const notebooks = await this.list(scope);
    const notebook = notebooks.find((entry) => entry.files.some((file) => file.id === fileId));
    return notebook?.id ?? "";
  }

  async getNotebookFiles(notebookId: string, scope?: ModuleScope) {
    const notebook = await this.getById(notebookId, scope);
    if (!notebook) return [];

    const visibleFiles: NotebookFile[] = [];
    const queue = getChildren(notebook.files, notebookId).map((file) => file.id);

    while (queue.length > 0) {
      const nextId = queue.shift();
      if (!nextId) continue;

      const nextFile = notebook.files.find((file) => file.id === nextId);
      if (!nextFile) continue;

      visibleFiles.push(nextFile);

      for (const child of getChildren(notebook.files, nextFile.id)) {
        queue.push(child.id);
      }
    }

    return visibleFiles;
  }
}

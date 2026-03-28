import type {
  T_App_Data,
  T_File,
  T_File_Metadata,
  T_File_Type,
  T_Notebook,
} from "@/types/types";

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

function sortFiles(files: T_File[]) {
  return [...files].sort((first, second) => {
    if (first.metadata.fileOrder !== second.metadata.fileOrder) {
      return first.metadata.fileOrder - second.metadata.fileOrder;
    }

    if (first.metadata.type === "folder" && second.metadata.type !== "folder") {
      return -1;
    }

    if (first.metadata.type !== "folder" && second.metadata.type === "folder") {
      return 1;
    }

    return first.name.localeCompare(second.name);
  });
}

function nextData(data: T_App_Data, patch: Partial<T_App_Data>): T_App_Data {
  return {
    ...data,
    ...patch,
    version: data.version + 1,
    updatedAt: nowIso(),
  };
}

function touchNotebook(notebook: T_Notebook) {
  return {
    ...notebook,
    updatedAt: nowIso(),
    updatedBy: getActorId(),
  };
}

function touchFile(file: T_File, metadata: Partial<T_File_Metadata> = {}) {
  return {
    ...file,
    metadata: {
      ...file.metadata,
      ...metadata,
      updatedAt: nowIso(),
      updatedBy: getActorId(),
    },
  };
}

function getChildren(files: T_File[], parentId: string) {
  return sortFiles(files.filter((file) => file.metadata.parentId === parentId));
}

function getDescendantIds(files: T_File[], rootId: string) {
  const ids = new Set<string>();
  const stack = [rootId];

  while (stack.length > 0) {
    const parentId = stack.pop();

    if (!parentId) {
      continue;
    }

    for (const child of files) {
      if (child.metadata.parentId !== parentId || ids.has(child.id)) {
        continue;
      }

      ids.add(child.id);
      stack.push(child.id);
    }
  }

  return ids;
}

export function getNotebookIdForFile(data: T_App_Data, fileId: string) {
  const notebookIds = new Set(data.notebooks.map((notebook) => notebook.id));
  let current = data.files.find((file) => file.id === fileId) ?? null;

  while (current) {
    if (notebookIds.has(current.metadata.parentId)) {
      return current.metadata.parentId;
    }

    current =
      data.files.find((file) => file.id === current?.metadata.parentId) ?? null;
  }

  return "";
}

export function getNotebookFiles(data: T_App_Data, notebookId: string) {
  const visibleFiles: T_File[] = [];
  const queue = getChildren(data.files, notebookId).map((file) => file.id);

  while (queue.length > 0) {
    const nextId = queue.shift();

    if (!nextId) {
      continue;
    }

    const nextFile = data.files.find((file) => file.id === nextId);

    if (!nextFile) {
      continue;
    }

    visibleFiles.push(nextFile);

    for (const child of getChildren(data.files, nextFile.id)) {
      queue.push(child.id);
    }
  }

  return visibleFiles;
}

export function createNotebook(data: T_App_Data, name?: string) {
  const timestamp = nowIso();
  const notebook: T_Notebook = {
    id: createId(),
    name: name?.trim() || "Untitled notebook",
    createdAt: timestamp,
    updatedAt: timestamp,
    createdBy: getActorId(),
    updatedBy: getActorId(),
  };

  return {
    data: nextData(data, {
      notebooks: [notebook, ...data.notebooks],
    }),
    notebook,
  };
}

export function renameNotebook(
  data: T_App_Data,
  notebookId: string,
  name: string,
) {
  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId
        ? { ...touchNotebook(notebook), name }
        : notebook,
    ),
  });
}

export function deleteNotebook(data: T_App_Data, notebookId: string) {
  const deleteIds = new Set<string>();

  for (const file of data.files.filter(
    (item) => item.metadata.parentId === notebookId,
  )) {
    deleteIds.add(file.id);

    for (const childId of getDescendantIds(data.files, file.id)) {
      deleteIds.add(childId);
    }
  }

  return nextData(data, {
    notebooks: data.notebooks.filter((notebook) => notebook.id !== notebookId),
    files: data.files.filter((file) => !deleteIds.has(file.id)),
  });
}

export function createFile(
  data: T_App_Data,
  options: {
    notebookId: string;
    parentId: string;
    type: T_File_Type;
    name?: string;
  },
) {
  const timestamp = nowIso();
  const siblingCount = getChildren(data.files, options.parentId).length;
  const defaultNames: Record<T_File_Type, string> = {
    folder: "Untitled folder",
    file: "Untitled note",
    draw: "Untitled drawing",
    image: "Untitled image",
  };
  const file: T_File = {
    id: createId(),
    name: options.name?.trim() || defaultNames[options.type],
    content: "",
    metadata: {
      url: "",
      size: 0,
      type: options.type,
      parentId: options.parentId,
      fileOrder: siblingCount,
      isPublic: false,
      isShared: false,
      sharedWith: [],
      tags: [],
      enabledFeatures: [],
      createdAt: timestamp,
      updatedAt: timestamp,
      createdBy: getActorId(),
      updatedBy: getActorId(),
    },
  };

  return {
    data: nextData(data, {
      notebooks: data.notebooks.map((notebook) =>
        notebook.id === options.notebookId ? touchNotebook(notebook) : notebook,
      ),
      files: [...data.files, file],
    }),
    file,
  };
}

export function renameFile(data: T_App_Data, fileId: string, name: string) {
  const notebookId = getNotebookIdForFile(data, fileId);

  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId ? touchNotebook(notebook) : notebook,
    ),
    files: data.files.map((file) =>
      file.id === fileId ? { ...touchFile(file), name } : file,
    ),
  });
}

export function deleteFile(data: T_App_Data, fileId: string) {
  const target = data.files.find((file) => file.id === fileId);

  if (!target) {
    return data;
  }

  const deleteIds = getDescendantIds(data.files, fileId);
  deleteIds.add(fileId);
  const notebookId = getNotebookIdForFile(data, fileId);
  const remainingFiles = data.files.filter((file) => !deleteIds.has(file.id));
  const siblings = getChildren(remainingFiles, target.metadata.parentId);
  const reindexedFiles = remainingFiles.map((file) => {
    if (file.metadata.parentId !== target.metadata.parentId) {
      return file;
    }

    return {
      ...file,
      metadata: {
        ...file.metadata,
        fileOrder: siblings.findIndex((sibling) => sibling.id === file.id),
      },
    };
  });

  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId ? touchNotebook(notebook) : notebook,
    ),
    files: reindexedFiles,
  });
}

export function duplicateFile(data: T_App_Data, fileId: string) {
  const target = data.files.find((file) => file.id === fileId);

  if (!target) {
    return { data, file: null };
  }

  const tree = data.files.filter(
    (file) =>
      file.id === fileId || getDescendantIds(data.files, fileId).has(file.id),
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
      metadata: {
        ...file.metadata,
        parentId: isRoot
          ? target.metadata.parentId
          : (idMap.get(file.metadata.parentId) ?? target.metadata.parentId),
        updatedAt: nowIso(),
        updatedBy: getActorId(),
        createdAt: nowIso(),
        createdBy: getActorId(),
      },
    };
  });
  const siblingIds = getChildren(
    [...data.files, ...clones],
    target.metadata.parentId,
  ).map((file) => file.id);
  const targetIndex = siblingIds.indexOf(fileId);
  const rootCloneId = clones[0]?.id ?? "";
  const reorderedIds = siblingIds.filter((id) => id !== rootCloneId);
  reorderedIds.splice(targetIndex + 1, 0, rootCloneId);
  const files = [...data.files, ...clones].map((file) => {
    if (file.metadata.parentId !== target.metadata.parentId) {
      return file;
    }

    return {
      ...file,
      metadata: {
        ...file.metadata,
        fileOrder: reorderedIds.indexOf(file.id),
      },
    };
  });

  return {
    data: nextData(data, {
      notebooks: data.notebooks.map((notebook) =>
        notebook.id === getNotebookIdForFile(data, fileId)
          ? touchNotebook(notebook)
          : notebook,
      ),
      files,
    }),
    file: clones[0] ?? null,
  };
}

export function reorderFiles(
  data: T_App_Data,
  parentId: string,
  orderedIds: string[],
) {
  const notebookId = getNotebookIdForFile(data, orderedIds[0] ?? "");

  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId ? touchNotebook(notebook) : notebook,
    ),
    files: data.files.map((file) => {
      if (file.metadata.parentId !== parentId) {
        return file;
      }

      return {
        ...file,
        metadata: {
          ...file.metadata,
          fileOrder: orderedIds.indexOf(file.id),
        },
      };
    }),
  });
}

export function moveFile(
  data: T_App_Data,
  fileId: string,
  nextParentId: string,
  nextIndex: number,
) {
  const target = data.files.find((file) => file.id === fileId);

  if (!target || target.id === nextParentId) {
    return data;
  }

  if (
    target.metadata.type === "folder" &&
    getDescendantIds(data.files, fileId).has(nextParentId)
  ) {
    return data;
  }

  const notebookId = getNotebookIdForFile(data, fileId);
  const previousParentId = target.metadata.parentId;
  const nextFiles = data.files.map((file) =>
    file.id === fileId
      ? touchFile(file, {
          parentId: nextParentId,
        })
      : file,
  );

  const previousSiblingIds = getChildren(nextFiles, previousParentId).map(
    (file) => file.id,
  );
  const nextSiblingIds = getChildren(nextFiles, nextParentId)
    .map((file) => file.id)
    .filter((id) => id !== fileId);
  const safeIndex = Math.max(0, Math.min(nextIndex, nextSiblingIds.length));
  nextSiblingIds.splice(safeIndex, 0, fileId);
  const reorderedIds =
    previousParentId === nextParentId ? nextSiblingIds : previousSiblingIds;

  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId ? touchNotebook(notebook) : notebook,
    ),
    files: nextFiles.map((file) => {
      if (file.metadata.parentId === previousParentId) {
        return {
          ...file,
          metadata: {
            ...file.metadata,
            fileOrder: reorderedIds.indexOf(file.id),
          },
        };
      }

      if (previousParentId !== nextParentId && file.metadata.parentId === nextParentId) {
        return {
          ...file,
          metadata: {
            ...file.metadata,
            fileOrder: nextSiblingIds.indexOf(file.id),
          },
        };
      }

      return file;
    }),
  });
}

export function updateFileContent(
  data: T_App_Data,
  fileId: string,
  content: string,
) {
  const notebookId = getNotebookIdForFile(data, fileId);

  return nextData(data, {
    notebooks: data.notebooks.map((notebook) =>
      notebook.id === notebookId ? touchNotebook(notebook) : notebook,
    ),
    files: data.files.map((file) =>
      file.id === fileId
        ? {
            ...touchFile(file, {
              size: new TextEncoder().encode(content).length,
            }),
            content,
          }
        : file,
    ),
  });
}

